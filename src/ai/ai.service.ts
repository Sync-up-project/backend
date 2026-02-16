import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  GenerateProjectDto,
  AiLanguage,
  MockPreset,
} from './dto/generate-project.dto';
import { ReviseArtifactDto } from './dto/revise-artifact.dto';
import { ApproveArtifactDto } from './dto/approve-artifact.dto';
import { AiProvider } from './providers/ai.provider';
import { MockAiProvider } from './providers/mock.provider';

import { IdeaNormalizedSchema } from './schemas/idea-normalized.schema';
import { ScreenListDraftSchema } from './schemas/screen-list.schema';
import { ApiSpecDraftSchema } from './schemas/api-spec.schema';
import { ErdDraftSchema } from './schemas/erd.schema';
import { ClarifyingQuestionsSchema } from './schemas/questions.schema';

import { PrismaService } from '../../prisma/prisma.service';
import { OpenAiProvider } from './providers/openai.provider';

// ✅ 추가: Prisma enum + JSON 타입
import { Prisma, AiArtifactType } from '@prisma/client';

@Injectable()
export class AiService {
  private readonly provider: AiProvider;
  private readonly cacheEnabled =
    (process.env.AI_CACHE_ENABLED ?? 'true').toLowerCase() !== 'false';
  private readonly cacheTtlMs = Number(process.env.AI_CACHE_TTL_MS ?? 300000);
  private readonly jobTtlMs = Number(process.env.AI_JOB_TTL_MS ?? 1800000);
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly jobs = new Map<
    string,
    {
      status: 'pending' | 'done' | 'error';
      result?: unknown;
      error?: { message: string; detail?: unknown };
      createdAt: number;
      updatedAt: number;
    }
  >();

  constructor(private readonly prisma: PrismaService) {
    const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();

    this.provider =
      provider === 'openai' ? new OpenAiProvider() : new MockAiProvider();
  }

  async generateProject(dto: GenerateProjectDto) {
    const language = this.mapLang(dto.language ?? AiLanguage.KO);
    const preset = this.mapPreset(dto.mockPreset);
    const cacheKey = this.cacheEnabled
      ? this.buildCacheKey({
          provider: this.provider.name,
          language,
          preset,
          ideaText: dto.ideaText,
        })
      : null;

    if (cacheKey) {
      const cached = this.getCache(cacheKey);
      if (cached) {
        return cached as any;
      }
    }

    // ✅ LLM(one-shot) provider: generate the whole bundle in one call
    if (typeof (this.provider as any).generateBundle === 'function') {
      const bundleRaw = await (this.provider as any).generateBundle({
        ideaText: dto.ideaText,
        language,
      });

      const ideaNormalized = this.parseOrThrow(
        IdeaNormalizedSchema,
        bundleRaw.ideaNormalized,
        'IdeaNormalized',
      );

      const screens = this.parseOrThrow(
        ScreenListDraftSchema,
        bundleRaw.screens,
        'ScreenListDraft',
      );

      const apiSpec = this.parseOrThrow(
        ApiSpecDraftSchema,
        bundleRaw.apiSpec,
        'ApiSpecDraft',
      );

      const erd = this.parseOrThrow(ErdDraftSchema, bundleRaw.erd, 'ErdDraft');

      const questions = this.parseOrThrow(
        ClarifyingQuestionsSchema,
        bundleRaw.questions,
        'ClarifyingQuestions',
      );

      const bundle = { ideaNormalized, screens, apiSpec, erd, questions };
      const bundleJson = bundle as unknown as Prisma.InputJsonValue;

      const artifact = await this.prisma.aiArtifact.create({
        data: {
          projectId: null,
          createdById: null,
          type: AiArtifactType.OTHER,
          version: 1,
          contentJson: bundleJson,
          promptHash: `llm:${this.provider.name}:v1`,
        },
        select: { id: true, createdAt: true },
      });

      const result = {
        ...bundle,
        meta: {
          provider: this.provider.name,
          preset,
          artifactId: artifact.id,
          savedAt: artifact.createdAt,
        },
      };
      if (cacheKey) {
        this.setCache(cacheKey, result);
      }
      return result;
    }

    // A
    const ideaRaw = await this.provider.normalizeIdea({
      ideaText: dto.ideaText,
      language,
      preset,
    });
    const ideaNormalized = this.parseOrThrow(
      IdeaNormalizedSchema,
      ideaRaw,
      'IdeaNormalized',
    );

    // B1
    const screensRaw = await this.provider.generateScreens({
      ideaNormalized,
      preset,
    });
    const screens = this.parseOrThrow(
      ScreenListDraftSchema,
      screensRaw,
      'ScreenListDraft',
    );

    // B2
    const apiRaw = await this.provider.generateApiSpec({
      ideaNormalized,
      screens,
      preset,
    });
    const apiSpec = this.parseOrThrow(
      ApiSpecDraftSchema,
      apiRaw,
      'ApiSpecDraft',
    );

    // B3
    const erdRaw = await this.provider.generateErd({ ideaNormalized, preset });
    const erd = this.parseOrThrow(ErdDraftSchema, erdRaw, 'ErdDraft');

    // C
    const qRaw = await this.provider.generateClarifyingQuestions({
      ideaNormalized,
      screens,
      apiSpec,
      erd,
      preset,
    });
    const questions = this.parseOrThrow(
      ClarifyingQuestionsSchema,
      qRaw,
      'ClarifyingQuestions',
    );

    const bundle = {
      ideaNormalized,
      screens,
      apiSpec,
      erd,
      questions,
    };

    // ✅ Zod 검증 통과 결과를 Prisma JSON 타입으로 캐스팅
    const bundleJson = bundle as unknown as Prisma.InputJsonValue;

    const artifact = await this.prisma.aiArtifact.create({
      data: {
        projectId: null,
        createdById: null,
        type: AiArtifactType.OTHER, // ✅ 현재 enum에 존재하는 값 사용
        version: 1,
        contentJson: bundleJson, // ✅ Prisma JSON 타입
        promptHash: `fixtures:${preset}:v1`,
      },
      select: { id: true, createdAt: true },
    });

    const result = {
      ...bundle,
      meta: {
        provider: this.provider.name,
        preset,
        artifactId: artifact.id,
        savedAt: artifact.createdAt,
      },
    };
    if (cacheKey) {
      this.setCache(cacheKey, result);
    }
    return result;
  }

  async createGenerateJob(dto: GenerateProjectDto) {
    this.cleanupJobs();
    const jobId = randomUUID();
    const now = Date.now();
    this.jobs.set(jobId, {
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    void this.runGenerateJob(jobId, dto);

    return { jobId, status: 'pending' as const };
  }

  getGenerateJob(jobId: string) {
    this.cleanupJobs();
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({ message: 'Job not found', jobId });
    }

    if (job.status === 'pending') {
      return { jobId, status: 'pending' as const };
    }

    if (job.status === 'error') {
      return { jobId, status: 'error' as const, error: job.error };
    }

    return { jobId, status: 'done' as const, result: job.result };
  }

  private mapLang(lang: AiLanguage): 'ko' | 'en' | 'ja' {
    if (lang === AiLanguage.EN) return 'en';
    if (lang === AiLanguage.JA) return 'ja';
    return 'ko';
  }

  private mapPreset(preset?: MockPreset): 'easy' | 'medium' | 'hard' {
    if (preset === MockPreset.EASY) return 'easy';
    if (preset === MockPreset.HARD) return 'hard';
    return 'medium';
  }

  private parseOrThrow<T>(
    schema: { safeParse: (v: unknown) => any },
    value: unknown,
    label: string,
  ): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: `AI output validation failed: ${label}`,
        issues: parsed.error.issues,
      });
    }
    return parsed.data as T;
  }

  private buildCacheKey(input: {
    provider: string;
    language: string;
    preset: string;
    ideaText: string;
  }) {
    const raw = JSON.stringify({
      provider: input.provider,
      language: input.language,
      preset: input.preset,
      ideaText: input.ideaText,
    });
    return createHash('sha256').update(raw).digest('hex');
  }

  private getCache(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCache(key: string, value: unknown) {
    const expiresAt = Date.now() + this.cacheTtlMs;
    this.cache.set(key, { value, expiresAt });
  }

  private async runGenerateJob(jobId: string, dto: GenerateProjectDto) {
    try {
      const result = await this.generateProject(dto);
      const job = this.jobs.get(jobId);
      if (!job) return;
      job.status = 'done';
      job.result = result;
      job.updatedAt = Date.now();
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (!job) return;
      job.status = 'error';
      job.error = this.serializeError(error);
      job.updatedAt = Date.now();
    }
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return { message: error.message };
    }
    return { message: 'Unknown error', detail: error };
  }

  private cleanupJobs() {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.createdAt > this.jobTtlMs) {
        this.jobs.delete(jobId);
      }
    }
  }

  async getArtifactById(id: string) {
    const artifact = (await this.prisma.aiArtifact.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        version: true,
        createdAt: true,
        createdById: true,
        projectId: true,
        updatedAt: true,
        promptHash: true,
        revisionBaseId: true,
        contentJson: true,
      } as any,
    })) as any;
    if (!artifact) {
      throw new NotFoundException({
        message: 'Artifact not found',
        id,
      });
    }

    const { contentJson, ...meta } = artifact;
    return {
      meta,
      contentJson,
    };
  }

  async getLatestArtifact(input?: { projectId?: string }) {
    const artifacts = (await this.prisma.aiArtifact.findFirst({
      where: input?.projectId ? { projectId: input.projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        version: true,
        projectId: true,
        createdById: true,
        promptHash: true,
        createdAt: true,
        updatedAt: true,
        revisionBaseId: true,
        contentJson: true,
      } as any,
    })) as any;

    if (!artifacts) {
      throw new NotFoundException({
        message: 'No AiArtifact found',
        projectId: input?.projectId ?? null,
      });
    }

    const { contentJson, ...meta } = artifacts;
    return {
      meta,
      contentJson,
    };
  }

  async listArtifacts(input?: { limit?: number; projectId?: string }) {
    const take = Math.min(Math.max(input?.limit ?? 20, 1), 100);

    const items = await this.prisma.aiArtifact.findMany({
      where: input?.projectId ? { projectId: input.projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        version: true,
        projectId: true,
        createdById: true,
        promptHash: true,
        createdAt: true,
        updatedAt: true,
        revisionBaseId: true,
        contentJson: true,
      } as any,
    });

    return {
      meta: {
        count: items.length,
        limit: take,
        projectId: input?.projectId ?? null,
      },
      items,
    };
  }

  async listArtifactRevisions(baseArtifactId: string) {
    const base = (await this.prisma.aiArtifact.findUnique({
      where: { id: baseArtifactId },
      select: {
        id: true,
        type: true,
        version: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        revisionBaseId: true,
        contentJson: true,
      } as any,
    })) as any;

    if (!base) {
      throw new NotFoundException({
        message: 'Artifact not found',
        id: baseArtifactId,
      });
    }

    const baseId = base.revisionBaseId ?? base.id;

    const revisions = (await this.prisma.aiArtifact.findMany({
      where: {
        OR: [{ id: baseId }, { revisionBaseId: baseId } as any],
      } as any,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        version: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        revisionBaseId: true,
        contentJson: true,
      } as any,
    })) as any;

    return {
      meta: { baseArtifactId: baseId, count: revisions.length },
      items: revisions,
    };
  }

  async reviseArtifact(artifactId: string, dto: ReviseArtifactDto) {
    const artifact = (await this.prisma.aiArtifact.findUnique({
      where: { id: artifactId },
      select: {
        id: true,
        type: true,
        version: true,
        projectId: true,
        contentJson: true,
        revisionBaseId: true,
      } as any,
    })) as any;

    if (!artifact) {
      throw new NotFoundException({
        message: 'Artifact not found',
        id: artifactId,
      });
    }

    const baseId = artifact.revisionBaseId ?? artifact.id;
    const language = dto.language
      ? this.mapLang(dto.language)
      : this.normalizeLang(
          (artifact.contentJson as any)?.ideaNormalized?.project_meta
            ?.primary_language,
        );

    if (typeof (this.provider as any).reviseBundle !== 'function') {
      throw new BadRequestException({
        message: 'Revision is not supported by current AI provider',
      });
    }

    const bundleRaw = await (this.provider as any).reviseBundle({
      language,
      instruction: dto.instruction,
      baseJson: artifact.contentJson,
    });

    const ideaNormalized = this.parseOrThrow(
      IdeaNormalizedSchema,
      bundleRaw.ideaNormalized,
      'IdeaNormalized',
    );
    const screens = this.parseOrThrow(
      ScreenListDraftSchema,
      bundleRaw.screens,
      'ScreenListDraft',
    );
    const apiSpec = this.parseOrThrow(
      ApiSpecDraftSchema,
      bundleRaw.apiSpec,
      'ApiSpecDraft',
    );
    const erd = this.parseOrThrow(ErdDraftSchema, bundleRaw.erd, 'ErdDraft');
    const questions = this.parseOrThrow(
      ClarifyingQuestionsSchema,
      bundleRaw.questions,
      'ClarifyingQuestions',
    );

    const bundle = { ideaNormalized, screens, apiSpec, erd, questions };
    const diff = computeJsonDiff(artifact.contentJson, bundle);

    const latest = await this.prisma.aiArtifact.findFirst({
      where: {
        OR: [{ id: baseId }, { revisionBaseId: baseId } as any],
      } as any,
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = latest?.version != null ? latest.version + 1 : 2;

    const bundleWithRevision = {
      ...bundle,
      revision: {
        baseArtifactId: baseId,
        revisedFromId: artifact.id,
        instruction: dto.instruction,
        revisedAt: new Date().toISOString(),
        diff,
      },
    };

    const bundleJson = bundleWithRevision as unknown as Prisma.InputJsonValue;

    const created = await this.prisma.aiArtifact.create({
      data: {
        projectId: artifact.projectId,
        createdById: null,
        type: artifact.type,
        version: nextVersion,
        contentJson: bundleJson,
        promptHash: `llm:${this.provider.name}:revise:v1`,
        revisionBaseId: baseId,
      } as any,
      select: { id: true, createdAt: true, version: true },
    });

    return {
      ...bundleWithRevision,
      meta: {
        provider: this.provider.name,
        artifactId: created.id,
        baseArtifactId: baseId,
        version: created.version,
        savedAt: created.createdAt,
      },
    };
  }

  async approveArtifact(artifactId: string, dto: ApproveArtifactDto) {
    const artifact = await this.prisma.aiArtifact.findUnique({
      where: { id: artifactId },
      select: { id: true, contentJson: true },
    });

    if (!artifact) {
      throw new NotFoundException({
        message: 'Artifact not found',
        id: artifactId,
      });
    }

    const content = artifact.contentJson as any;
    const approval = {
      approvedAt: new Date().toISOString(),
      note: dto.note ?? null,
    };

    const merged = {
      ...(content ?? {}),
      approval,
    };

    const updated = await this.prisma.aiArtifact.update({
      where: { id: artifactId },
      data: { contentJson: merged as unknown as Prisma.InputJsonValue },
      select: { id: true, updatedAt: true },
    });

    return { meta: { id: updated.id, updatedAt: updated.updatedAt }, approval };
  }

  private normalizeLang(lang?: string): 'ko' | 'en' | 'ja' {
    if (!lang) return 'ko';
    const v = String(lang).toLowerCase();
    if (v === 'ko' || v === 'en' || v === 'ja') return v as any;
    return 'ko';
  }
}

type DiffEntry = {
  path: string;
  before: any;
  after: any;
};

function computeJsonDiff(before: any, after: any): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  const walk = (a: any, b: any, path: string) => {
    if (Object.is(a, b)) return;

    const aIsObj = a && typeof a === 'object';
    const bIsObj = b && typeof b === 'object';

    if (!aIsObj || !bIsObj) {
      diffs.push({ path, before: a, after: b });
      return;
    }

    const aIsArr = Array.isArray(a);
    const bIsArr = Array.isArray(b);
    if (aIsArr || bIsArr) {
      if (!aIsArr || !bIsArr) {
        diffs.push({ path, before: a, after: b });
        return;
      }
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        walk(a[i], b[i], `${path}[${i}]`);
      }
      return;
    }

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      walk(a[key], b[key], path ? `${path}.${key}` : key);
    }
  };

  walk(before, after, '');
  return diffs;
}
