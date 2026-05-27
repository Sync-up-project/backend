import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  GenerateProjectDto,
  AiLanguage,
  MockPreset,
  OpenAiBundleModel,
} from './dto/generate-project.dto';
import { GenerateScheduleDraftDto } from './dto/generate-schedule-draft.dto';
import { ReviseArtifactDto } from './dto/revise-artifact.dto';
import { ApproveArtifactDto } from './dto/approve-artifact.dto';
import { AiProvider } from './providers/ai.provider';
import { MockAiProvider } from './providers/mock.provider';

import { IdeaNormalizedSchema } from './schemas/idea-normalized.schema';
import { ScreenListDraftSchema } from './schemas/screen-list.schema';
import { ApiSpecDraftSchema } from './schemas/api-spec.schema';
import { ErdDraftSchema } from './schemas/erd.schema';
import { ClarifyingQuestionsSchema } from './schemas/questions.schema';
import { ProjectScheduleDraftSchema } from './schemas/project-schedule-draft.schema';
import type { ProjectScheduleDraftParsed } from './schemas/project-schedule-draft.schema';

import { PrismaService } from '../../prisma/prisma.service';
import { OpenAiProvider } from './providers/openai.provider';
import { sanitizeIdeaConstraintDatesInPlace } from './utils/sanitize-idea-constraint-dates';
import {
  clampScheduleDraftEventDates,
  computeScheduleWindow,
} from './utils/clamp-schedule-draft-events';

// ✅ 추가: Prisma enum + JSON 타입
import { Prisma, AiArtifactType } from '@prisma/client';

/** 번들 생성에 쓸 OpenAI 모델 (화이트리스트 + env 폴백). 클래스 메서드가 아니라 모듈 함수로 두어 this 바인딩·구 빌드 불일치를 피함 */
function resolveOpenAiBundleModel(dto: GenerateProjectDto): string {
  const allowed = new Set<string>(Object.values(OpenAiBundleModel));
  const fromDto = dto.openAiModel;
  if (fromDto != null && allowed.has(fromDto)) return fromDto;
  const env = process.env.OPENAI_MODEL ?? OpenAiBundleModel.GPT_41_MINI;
  return allowed.has(env) ? env : OpenAiBundleModel.GPT_41_MINI;
}

function resolveOpenAiScheduleModel(dto: GenerateScheduleDraftDto): string {
  const allowed = new Set<string>(Object.values(OpenAiBundleModel));
  const fromDto = dto.openAiModel;
  if (fromDto != null && allowed.has(fromDto)) return fromDto;
  const env = process.env.OPENAI_MODEL ?? OpenAiBundleModel.GPT_41_MINI;
  return allowed.has(env) ? env : OpenAiBundleModel.GPT_41_MINI;
}

function scheduleArtifactSnippet(value: unknown, maxLen: number): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return '';
  }
}

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
    const requestedCreatedById = (dto as any).createdById;
    let createdById: string | null = null;
    if (
      typeof requestedCreatedById === 'string' &&
      requestedCreatedById.trim().length > 0
    ) {
      const foundUser = await this.prisma.user.findUnique({
        where: { id: requestedCreatedById.trim() },
        select: { id: true },
      });
      createdById = foundUser?.id ?? null;
    }
    const bundleModel = resolveOpenAiBundleModel(dto);
    const cacheKey = this.cacheEnabled
      ? this.buildCacheKey({
          provider: this.provider.name,
          language,
          preset,
          ideaText: dto.ideaText,
          openAiModel: bundleModel,
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
        model: bundleModel,
      });

      const ideaNormalized = this.parseOrThrow(
        IdeaNormalizedSchema,
        bundleRaw.ideaNormalized,
        'IdeaNormalized',
      );
      sanitizeIdeaConstraintDatesInPlace(ideaNormalized);

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
          createdById,
          type: AiArtifactType.OTHER,
          version: 1,
          contentJson: bundleJson,
          promptHash: `llm:${this.provider.name}:${bundleModel}:v1`,
        },
        select: { id: true, createdAt: true },
      });

      const result = {
        ...bundle,
        meta: {
          provider: this.provider.name,
          preset,
          openAiModel: bundleModel,
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
    sanitizeIdeaConstraintDatesInPlace(ideaNormalized);

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
        createdById,
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

  /**
   * ✅ AI 기반 프로젝트 일정 초안(JSON). 멤버/오너만 호출. DB에는 저장하지 않습니다.
   */
  async generateProjectScheduleDraft(
    projectId: string,
    userId: string,
    dto: GenerateScheduleDraftDto,
  ) {
    if (!userId) {
      throw new ForbiddenException('로그인이 필요합니다.');
    }

    const access = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!access) {
      throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    }

    let isAllowed = access.ownerId === userId;
    if (!isAllowed) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { id: true },
      });
      isAllowed = Boolean(member);
    }
    if (!isAllowed) {
      throw new ForbiddenException('프로젝트 멤버만 일정 초안을 생성할 수 있어요.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        titleOriginal: true,
        summaryOriginal: true,
        descriptionOriginal: true,
        mode: true,
        difficulty: true,
        status: true,
        capacity: true,
        deadline: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        techStacks: { select: { techStack: { select: { name: true } } } },
      },
    });
    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    }

    const { windowStart, windowEnd } = computeScheduleWindow({
      startDate: project.startDate,
      endDate: project.endDate,
      deadline: project.deadline,
      createdAt: project.createdAt,
    });

    const artifacts = await this.prisma.aiArtifact.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { type: true, title: true, contentJson: true },
    });

    const projectFacts = JSON.stringify(
      {
        title: project.titleOriginal,
        summary: project.summaryOriginal,
        description: project.descriptionOriginal?.slice(0, 4000),
        mode: project.mode,
        difficulty: project.difficulty,
        status: project.status,
        capacity: project.capacity,
        deadline: project.deadline,
        startDate: project.startDate,
        endDate: project.endDate,
        techStacks: project.techStacks.map(ts => ts.techStack.name),
        scheduleWindow: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
        },
      },
      null,
      2,
    );

    let artifactContext = artifacts
      .map(
        a =>
          `\n--- ${String(a.type)} ${a.title ? String(a.title) : ''} ---\n${scheduleArtifactSnippet(
            a.contentJson,
            3200,
          )}\n`,
      )
      .join('');
    if (artifactContext.length > 24000) {
      artifactContext = `${artifactContext.slice(0, 24000)}\n…(truncated)`;
    }

    const target = Math.min(30, Math.max(5, dto.maxEvents ?? 15));
    const maxLo = Math.max(5, target - 4);
    const maxHi = Math.min(30, target + 6);

    const language = this.mapLang(dto.language ?? AiLanguage.KO);

    let raw: unknown;
    const genSchedule = (this.provider as any).generateProjectScheduleDraft;
    if (typeof genSchedule !== 'function') {
      throw new BadRequestException('현재 AI 프로바이더가 일정 초안을 지원하지 않습니다.');
    }

    if (this.provider.name === 'openai') {
      const model = resolveOpenAiScheduleModel(dto);
      raw = await genSchedule.call(this.provider, {
        language,
        model,
        projectFacts,
        artifactContext,
        maxEventsTarget: target,
        maxEventsLo: maxLo,
        maxEventsHi: maxHi,
        additionalNotes: dto.additionalNotes ?? '',
      });
    } else {
      raw = await genSchedule.call(this.provider, {});
    }

    const parsed = this.parseOrThrow<ProjectScheduleDraftParsed>(
      ProjectScheduleDraftSchema,
      raw,
      'ProjectScheduleDraft',
    );

    let events = parsed.events;
    if (events.length > target) {
      events = events.slice(0, target);
    }

    const normalized = events.map(ev => {
      const dates = clampScheduleDraftEventDates(
        { startAt: ev.startAt, endAt: ev.endAt },
        windowStart,
        windowEnd,
      );

      const desc =
        typeof ev.description === 'string' && ev.description.trim()
          ? ev.description.trim().slice(0, 4500)
          : undefined;

      const memo =
        typeof ev.memo === 'string' && ev.memo.trim()
          ? ev.memo.trim().slice(0, 4500)
          : undefined;

      return {
        title: ev.title.trim().slice(0, 230),
        description: desc,
        memo,
        startAt: dates.startAt,
        endAt: dates.endAt,
        type: ev.type,
        status: 'TODO',
        priority: ev.priority,
        progress: 0,
        isAllDay: Boolean(ev.isAllDay),
      };
    });

    normalized.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

    return {
      meta: {
        provider: this.provider.name,
        openAiModel:
          this.provider.name === 'openai' ? resolveOpenAiScheduleModel(dto) : null,
        projectId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        count: normalized.length,
      },
      events: normalized,
    };
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
    openAiModel: string;
  }) {
    const raw = JSON.stringify({
      provider: input.provider,
      language: input.language,
      preset: input.preset,
      ideaText: input.ideaText,
      openAiModel: input.openAiModel,
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
    sanitizeIdeaConstraintDatesInPlace(ideaNormalized);
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

  /**
   * 드래프트 contentJson 직접 수정 (프로젝트 미연결·작성자만)
   */
  async updateArtifactContent(
    artifactId: string,
    userId: string,
    incomingRoot: unknown,
  ) {
    const incoming =
      incomingRoot &&
      typeof incomingRoot === 'object' &&
      'contentJson' in (incomingRoot as object)
        ? (incomingRoot as any).contentJson
        : incomingRoot;

    if (!incoming || typeof incoming !== 'object') {
      throw new BadRequestException({
        message: 'contentJson 객체가 필요해요.',
      });
    }

    const artifact = await this.prisma.aiArtifact.findUnique({
      where: { id: artifactId },
      select: {
        id: true,
        createdById: true,
        projectId: true,
        contentJson: true,
      } as any,
    });

    if (!artifact) {
      throw new NotFoundException({
        message: 'Artifact not found',
        id: artifactId,
      });
    }

    if (artifact.projectId) {
      throw new BadRequestException({
        message:
          '이미 프로젝트에 연결된 드래프트는 직접 수정할 수 없어요. 새 버전으로 복제하거나 AI 수정을 이용해 주세요.',
      });
    }

    if (artifact.createdById && artifact.createdById !== userId) {
      throw new ForbiddenException({
        message: '이 드래프트를 수정할 권한이 없어요.',
      });
    }

    const prev = (artifact.contentJson ?? {}) as Record<string, unknown>;
    const merged = { ...prev, ...(incoming as Record<string, unknown>) };

    const ideaNormalized = this.parseOrThrow(
      IdeaNormalizedSchema,
      merged.ideaNormalized,
      'IdeaNormalized',
    );
    sanitizeIdeaConstraintDatesInPlace(ideaNormalized);

    const screens = this.parseOrThrow(
      ScreenListDraftSchema,
      merged.screens,
      'ScreenListDraft',
    );
    const apiSpec = this.parseOrThrow(
      ApiSpecDraftSchema,
      merged.apiSpec,
      'ApiSpecDraft',
    );
    const erd = this.parseOrThrow(ErdDraftSchema, merged.erd, 'ErdDraft');
    const questions = this.parseOrThrow(
      ClarifyingQuestionsSchema,
      merged.questions,
      'ClarifyingQuestions',
    );

    const nextContent = {
      ...merged,
      ideaNormalized,
      screens,
      apiSpec,
      erd,
      questions,
    };

    await this.prisma.aiArtifact.update({
      where: { id: artifactId },
      data: { contentJson: nextContent as unknown as Prisma.InputJsonValue },
    });

    return this.getArtifactById(artifactId);
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
