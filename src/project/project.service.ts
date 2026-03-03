import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmProjectDto } from './dto/confirm-project.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  /**
   * ✅ POST /projects
   * 일반 프로젝트 생성(프론트 폼 기반)
   *
   * ⚠️ 지금은 인증 연동 전이라 CreateProjectDto.ownerId를 body로 받는 형태를 가정합니다.
   * 나중에 로그인 붙이면 ownerId는 CurrentUser에서 꺼내는 방식으로 바꾸는 게 정석입니다.
   */
  async createProject(dto: CreateProjectDto) {
    const ownerId = (dto as any).ownerId;
    if (!ownerId) throw new BadRequestException('ownerId가 필요해요.');
    if (!dto.titleOriginal?.trim())
      throw new BadRequestException('titleOriginal이 필요해요.');

    const originalLang = (dto as any).originalLang ?? 'KO';
    const titleOriginal = dto.titleOriginal.trim();
    const summaryOriginal =
      (dto as any).summaryOriginal?.trim?.() ??
      (dto as any).summaryOriginal ??
      '';
    const descriptionOriginal =
      (dto as any).descriptionOriginal?.trim?.() ??
      (dto as any).descriptionOriginal ??
      '';

    const mode = (dto as any).mode ?? ('ONLINE' as any);
    const difficulty = (dto as any).difficulty ?? ('MEDIUM' as any);
    const status = (dto as any).status ?? ('PLANNING' as any);

    const capacity = Number((dto as any).capacity ?? 1);

    const deadline = (dto as any).deadline
      ? new Date((dto as any).deadline)
      : null;
    const startDate = (dto as any).startDate
      ? new Date((dto as any).startDate)
      : null;
    const endDate = (dto as any).endDate
      ? new Date((dto as any).endDate)
      : null;

    // techStacks: ["React","NestJS"] or [{name:"React"}] 등을 폭넓게 수용
    const rawTechStacks = (dto as any).techStacks;
    const techStackNames: string[] = Array.isArray(rawTechStacks)
      ? rawTechStacks
          .map((t: any) => (typeof t === 'string' ? t : t?.name))
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
          .map((v: string) => v.trim())
      : [];

    // positionNeeds: [{ position: "DEV", headcount: 2 }] 형태 수용
    const rawPositionNeeds = (dto as any).positionNeeds;
    const positionNeeds: Array<{ position: any; headcount?: number }> =
      Array.isArray(rawPositionNeeds) ? rawPositionNeeds : [];

    const created = await this.prisma.$transaction(async tx => {
      // (a) Project 생성
      const project = await tx.project.create({
        data: {
          ownerId,
          originalLang,
          titleOriginal,
          summaryOriginal,
          descriptionOriginal,
          mode,
          difficulty,
          status,
          capacity,
          deadline,
          startDate,
          endDate,
        },
      });

      // (b) TechStack upsert + 연결
      for (const name of techStackNames) {
        const tech = await tx.techStack.upsert({
          where: { name },
          update: {},
          create: { name },
        });

        await tx.projectTechStack.create({
          data: { projectId: project.id, techStackId: tech.id },
        });
      }

      // (c) PositionNeeds 생성
      for (const pn of positionNeeds) {
        if (!pn?.position) continue;
        await tx.projectPositionNeed.create({
          data: {
            projectId: project.id,
            position: pn.position,
            headcount: pn.headcount ? Number(pn.headcount) : 1,
          },
        });
      }

      // (d) KanbanBoard 기본 생성(컬럼 3개)
      const board = await tx.kanbanBoard.create({
        data: {
          projectId: project.id,
          columns: {
            create: [
              { title: 'TODO', position: 0 },
              { title: 'IN_PROGRESS', position: 1 },
              { title: 'DONE', position: 2 },
            ],
          },
        },
        include: { columns: true },
      });

      return { project, board };
    });

    return created;
  }

  /**
   * ✅ DELETE /projects/:id
   * - 프로젝트 삭제
   *
   * ⚠️ 현재는 인증/인가 연동 전이므로, 소유자 검증(오너만 삭제)은 하지 않습니다.
   *   로그인 연동 후에는 아래 형태로 확장 권장:
   *   - deleteProject(projectId: string, userId: string)
   *   - project.ownerId === userId 검증
   *
   * ✅ FK(외래키) 제약으로 삭제가 실패하지 않도록
   *   연관 테이블(칸반/멤버/스택연결/포지션 등)을 먼저 정리한 뒤 project를 삭제합니다.
   */
  async deleteProject(projectId: string, userId: string) {
    if (!userId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });

    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('프로젝트 소유자만 삭제할 수 있어요.');
    }

    try {
      await this.prisma.$transaction(async tx => {
        // 1) 프로젝트 관련 매핑/하위 데이터 정리
        // - 프로젝트 기술스택 매핑
        await tx.projectTechStack.deleteMany({ where: { projectId } });

        // - 프로젝트 포지션 니즈
        await tx.projectPositionNeed.deleteMany({ where: { projectId } });

        // - 프로젝트 멤버(참여자)
        //   모델명이 projectMember일 수도 있으니, 실제 스키마에 맞게 조정 필요할 수 있습니다.
        //   현재 getProjectList/getProjectById에서 project.members를 쓰므로 members 관계 테이블이 존재한다고 가정합니다.
        //   만약 model명이 다르면 여기서 컴파일 에러가 납니다 -> 그 경우 모델명만 알려주시면 바로 맞춰드리겠습니다.
        await tx.projectMember.deleteMany({ where: { projectId } });

        // - 프로젝트 i18n(존재한다면)
        //   getProjectById에서 include: { i18n: true } 를 사용하므로 projectI18n 같은 테이블이 있을 수 있습니다.
        //   없으면 이 줄에서 컴파일 에러가 납니다 -> 그 경우 모델명/관계명에 맞춰 수정하면 됩니다.
        await tx.projectI18n.deleteMany({ where: { projectId } });

        // 2) 칸반 삭제 (보드 -> 컬럼 -> 카드 -> 담당자 등)
        // 보드가 projectId로 유니크 조회되므로 board를 먼저 찾습니다.
        const board = await tx.kanbanBoard.findUnique({
          where: { projectId },
          select: { id: true },
        });

        if (board) {
          // 카드/담당자(assignees)가 FK로 물려있을 가능성이 커서, 안전하게 하위부터 정리합니다.
          // columnIds -> cardIds 추적 삭제
          const columns = await tx.kanbanColumn.findMany({
            where: { boardId: board.id },
            select: { id: true },
          });
          const columnIds = columns.map(c => c.id);

          if (columnIds.length > 0) {
            const cards = await tx.kanbanCard.findMany({
              where: { columnId: { in: columnIds } },
              select: { id: true },
            });
            const cardIds = cards.map(c => c.id);

            if (cardIds.length > 0) {
              // 카드 담당자 매핑(assignees)
              await tx.kanbanCardAssignee.deleteMany({
                where: { cardId: { in: cardIds } },
              });

              // 카드 삭제
              await tx.kanbanCard.deleteMany({
                where: { id: { in: cardIds } },
              });
            }

            // 컬럼 삭제
            await tx.kanbanColumn.deleteMany({
              where: { id: { in: columnIds } },
            });
          }

          // 보드 삭제
          await tx.kanbanBoard.delete({
            where: { id: board.id },
          });
        }

        // 3) 마지막으로 프로젝트 삭제
        await tx.project.delete({
          where: { id: projectId },
        });
      });

      return { message: '프로젝트가 삭제되었습니다.' };
    } catch (e: any) {
      // FK 제약 / 스키마 불일치 등
      // 실제 에러 메시지를 숨기지 않고 요약하여 전달
      throw new BadRequestException(
        `프로젝트 삭제 중 오류가 발생했습니다. (연관 데이터/스키마 확인 필요)`,
      );
    }
  }

  /**
   * ✅ PATCH /projects/:id
   * - 오너만 프로젝트 핵심 정보를 수정
   * - 모집 조기 마감은 deadline을 현재 시각으로 patch 하면 처리됩니다.
   */
  async updateProject(
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ) {
    if (!userId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('프로젝트 소유자만 수정할 수 있어요.');
    }

    const data: any = {};
    if (typeof dto.titleOriginal === 'string')
      data.titleOriginal = dto.titleOriginal.trim();
    if (typeof dto.summaryOriginal === 'string')
      data.summaryOriginal = dto.summaryOriginal.trim();
    if (typeof dto.descriptionOriginal === 'string')
      data.descriptionOriginal = dto.descriptionOriginal.trim();
    if (typeof dto.capacity === 'number' && Number.isFinite(dto.capacity)) {
      data.capacity = Math.max(1, Math.floor(dto.capacity));
    }
    if (dto.deadline) data.deadline = new Date(dto.deadline);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (typeof (dto as any).mode === 'string') data.mode = (dto as any).mode;
    if (typeof (dto as any).difficulty === 'string')
      data.difficulty = (dto as any).difficulty;
    if (typeof (dto as any).status === 'string')
      data.status = (dto as any).status;

    const rawTechStacks = (dto as any).techStacks;
    const techStackNames: string[] | null = Array.isArray(rawTechStacks)
      ? rawTechStacks
          .map((t: any) => (typeof t === 'string' ? t : t?.name))
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
          .map((v: string) => v.trim())
      : null;

    const rawPositionNeeds = (dto as any).positionNeeds;
    const positionNeeds: Array<{ position: any; headcount?: number }> | null =
      Array.isArray(rawPositionNeeds) ? rawPositionNeeds : null;

    if (
      Object.keys(data).length === 0 &&
      techStackNames === null &&
      positionNeeds === null
    ) {
      throw new BadRequestException('수정할 항목이 없어요.');
    }

    const updated = await this.prisma.$transaction(async tx => {
      const projectUpdated = await tx.project.update({
        where: { id: projectId },
        data,
      });

      if (techStackNames !== null) {
        await tx.projectTechStack.deleteMany({ where: { projectId } });
        for (const name of techStackNames) {
          const tech = await tx.techStack.upsert({
            where: { name },
            update: {},
            create: { name },
          });
          await tx.projectTechStack.create({
            data: { projectId, techStackId: tech.id },
          });
        }
      }

      if (positionNeeds !== null) {
        await tx.projectPositionNeed.deleteMany({ where: { projectId } });
        for (const pn of positionNeeds) {
          if (!pn?.position) continue;
          await tx.projectPositionNeed.create({
            data: {
              projectId,
              position: pn.position,
              headcount: pn.headcount ? Number(pn.headcount) : 1,
            },
          });
        }
      }

      const full = await tx.project.findUnique({
        where: { id: projectUpdated.id },
        select: {
          id: true,
          ownerId: true,
          titleOriginal: true,
          summaryOriginal: true,
          descriptionOriginal: true,
          mode: true,
          difficulty: true,
          status: true,
          capacity: true,
          deadline: true,
          endDate: true,
          updatedAt: true,
          techStacks: {
            include: {
              techStack: { select: { id: true, name: true } },
            },
          },
          positionNeeds: {
            select: { id: true, position: true, headcount: true },
          },
        },
      });
      return full;
    });
    return { project: updated };
  }

  /**
   * ✅ (기존 ProjectService 내용 흡수)
   * 프론트 호환용: GET /projects/list
   */
  async getProjectList(userId?: string) {
    const projects = await this.prisma.project.findMany({
      include: {
        owner: { select: { id: true, nickname: true } },
        techStacks: {
          include: { techStack: { select: { id: true, name: true } } },
        },
        positionNeeds: { select: { id: true, position: true } },
        members: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map(project => {
      const membersCount = project.members.length + 1; // +1은 소유자
      const membersCountMax = project.capacity;

      const techStacks = project.techStacks.map(pt => ({
        id: pt.techStack.id,
        name: pt.techStack.name,
      }));

      const positionNeeds = project.positionNeeds.map(pn => ({
        id: pn.id,
        position: pn.position,
      }));

      // TODO: 좋아요 기능 추가 시 수정
      const LIKE = 'false';

      return {
        id: project.id,
        title: project.titleOriginal,
        summary: project.summaryOriginal,
        ownerid: project.ownerId, // (주의) 기존 반환 필드명 유지
        nickname: project.owner.nickname,
        techStacks,
        endDate: project.endDate?.toISOString() || null,
        positionNeeds,
        membersCount,
        membersCountMax,
        LIKE,
      };
    });
  }

  /**
   * ✅ GET /projects?limit=20
   * - “새 버전” 리스트 API
   * - 응답 형태는 네가 프론트에서 쓰기 편하게 getProjectList랑 비슷한 정보를 포함
   */
  async listProjects(opts: { limit: number }) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), 100);

    const projects = await this.prisma.project.findMany({
      take,
      include: {
        owner: { select: { id: true, nickname: true } },
        techStacks: {
          include: { techStack: { select: { id: true, name: true } } },
        },
        positionNeeds: {
          select: { id: true, position: true, headcount: true },
        },
        members: { select: { id: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: projects.map(p => ({
        id: p.id,
        ownerId: p.ownerId,
        owner: p.owner,
        originalLang: p.originalLang,
        titleOriginal: p.titleOriginal,
        summaryOriginal: p.summaryOriginal,
        descriptionOriginal: p.descriptionOriginal,
        mode: p.mode,
        difficulty: p.difficulty,
        status: p.status,
        capacity: p.capacity,
        deadline: p.deadline,
        startDate: p.startDate,
        endDate: p.endDate,
        likeCount: p.likeCount,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        techStacks: p.techStacks.map(pt => ({
          id: pt.techStack.id,
          name: pt.techStack.name,
        })),
        positionNeeds: p.positionNeeds.map(pn => ({
          id: pn.id,
          position: pn.position,
          headcount: pn.headcount,
        })),
        membersCount: p.members.length + 1, // owner 포함
      })),
      nextCursor: null,
    };
  }

  /**
   * ✅ GET /projects/:id
   * - 상세 페이지에 필요한 정보(관계 포함)
   */
  async getProjectById(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, nickname: true, profileImageUrl: true } },
        i18n: true,
        techStacks: { include: { techStack: true } },
        positionNeeds: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                profileImageUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });

    const latestArtifactRow = await this.prisma.aiArtifact.findFirst({
      where: { projectId: id },
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
        contentJson: true,
      },
    });

    const latestArtifact = latestArtifactRow
      ? {
          meta: {
            id: latestArtifactRow.id,
            type: latestArtifactRow.type,
            version: latestArtifactRow.version,
            projectId: latestArtifactRow.projectId,
            createdById: latestArtifactRow.createdById,
            promptHash: latestArtifactRow.promptHash,
            createdAt: latestArtifactRow.createdAt,
            updatedAt: latestArtifactRow.updatedAt,
          },
          contentJson: latestArtifactRow.contentJson,
        }
      : null;

    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    return { project, latestArtifact };
  }

  /**
   * ✅ GET /projects/:id/kanban
   * - projectId 기준으로 칸반보드 조회
   * - columns/cards는 position 기준 정렬
   */
  async getKanbanBoard(projectId: string) {
    const board = await this.prisma.kanbanBoard.findUnique({
      where: { projectId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            cards: {
              orderBy: { position: 'asc' },
              include: {
                assignees: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        nickname: true,
                        profileImageUrl: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return board;
  }

  /**
   * ✅ GET /projects/:id/recommend-users
   * - 오너 기준으로 프로젝트에 맞는 유저 추천
   * - 초대/자동매칭 액션 없이 "추천 목록 조회"만 제공
   */
  async getRecommendUsers(projectId: string, userId: string, limit = 5) {
    if (!userId) throw new ForbiddenException('로그인이 필요합니다.');

    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        techStacks: {
          include: { techStack: { select: { name: true } } },
        },
        positionNeeds: { select: { position: true } },
        members: { select: { userId: true } },
      },
    });

    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId !== userId) {
      throw new ForbiddenException('프로젝트 소유자만 추천 유저를 볼 수 있어요.');
    }

    const excludedUserIds = Array.from(
      new Set([project.ownerId, ...project.members.map(m => m.userId)]),
    );

    const neededRoles = Array.from(
      new Set(project.positionNeeds.map(p => String(p.position))),
    );

    const projectTechSet = new Set(
      project.techStacks
        .map(t => t.techStack.name)
        .filter(Boolean)
        .map(v => v.toLowerCase()),
    );

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludedUserIds },
        ...(neededRoles.length > 0 ? { role: { in: neededRoles as any } } : {}),
      },
      select: {
        id: true,
        nickname: true,
        role: true,
        githubCommits: true,
        githubRepoCount: true,
        githubTopLangs: true,
        techStacks: {
          include: { techStack: { select: { name: true } } },
        },
      },
      take: 200,
    });

    const items = candidates
      .map(candidate => {
        const candidateTechNames = candidate.techStacks
          .map(t => t.techStack.name)
          .filter(Boolean);
        const candidateTechSet = new Set(
          candidateTechNames.map(v => v.toLowerCase()),
        );

        const roleMatch =
          neededRoles.length === 0
            ? 1
            : neededRoles.includes(String(candidate.role ?? ''));

        const intersectionCount = [...candidateTechSet].filter(v =>
          projectTechSet.has(v),
        ).length;
        const unionCount = new Set([
          ...Array.from(projectTechSet),
          ...Array.from(candidateTechSet),
        ]).size;
        const techScore = unionCount > 0 ? intersectionCount / unionCount : 0;

        const commitNorm = Math.min(
          Math.max((candidate.githubCommits ?? 0) / 600, 0),
          1,
        );
        const repoNorm = Math.min(
          Math.max((candidate.githubRepoCount ?? 0) / 30, 0),
          1,
        );
        const activityScore = 0.7 * commitNorm + 0.3 * repoNorm;

        const topLangs = this.extractTopLangNames(candidate.githubTopLangs);
        const topLangOverlap = topLangs.some(lang =>
          projectTechSet.has(lang.toLowerCase()),
        )
          ? 1
          : 0;

        const totalScore =
          (roleMatch ? 35 : 0) +
          techScore * 45 +
          activityScore * 15 +
          topLangOverlap * 5;

        const reasons: string[] = [];
        if (roleMatch && candidate.role) {
          reasons.push(`${String(candidate.role)} 포지션 일치`);
        }
        if (intersectionCount > 0) {
          const matchedTech = candidateTechNames
            .filter(name => projectTechSet.has(name.toLowerCase()))
            .slice(0, 2);
          reasons.push(`공통 스택: ${matchedTech.join(', ')}`);
        }
        if ((candidate.githubCommits ?? 0) >= 150) {
          reasons.push(`최근 활동량 높음(커밋 ${candidate.githubCommits})`);
        }
        if (reasons.length === 0) reasons.push('기본 조건 기반 추천');

        return {
          id: candidate.id,
          nickname: candidate.nickname ?? '이름 없음',
          role: candidate.role ?? null,
          techStacks: candidateTechNames.slice(0, 5),
          githubCommits: candidate.githubCommits ?? 0,
          githubRepoCount: candidate.githubRepoCount ?? 0,
          matchingPoint: Math.round(totalScore),
          reasons: reasons.slice(0, 3),
        };
      })
      .sort((a, b) => b.matchingPoint - a.matchingPoint)
      .slice(0, safeLimit);

    return { projectId, items };
  }

  private extractTopLangNames(value: any): string[] {
    if (!value) return [];

    // { TypeScript: 40, Python: 20 } 형태
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).slice(0, 5);
    }

    // ["TypeScript", "Python"] 또는 [{name:"TypeScript"}] 형태
    if (Array.isArray(value)) {
      return value
        .map(v => {
          if (typeof v === 'string') return v;
          if (v && typeof v === 'object' && typeof v.name === 'string')
            return v.name;
          return null;
        })
        .filter((v): v is string => Boolean(v))
        .slice(0, 5);
    }

    return [];
  }

  /**
   * ✅ POST /projects/confirm
   * - artifact 기반 생성
   */
  async confirmFromArtifact(dto: ConfirmProjectDto) {
    const raw: any =
      (dto as any).project ??
      (dto as any).artifact ??
      (dto as any).contentJson ??
      dto;

    const requestedOwnerId = raw.ownerId ?? (dto as any).ownerId ?? null;
    const artifact = dto.artifactId
      ? await this.prisma.aiArtifact.findUnique({
          where: { id: dto.artifactId },
          select: { createdById: true },
        })
      : null;
    const fallbackOwnerId = artifact?.createdById ?? null;

    let ownerId: string | null = null;
    for (const candidate of [requestedOwnerId, fallbackOwnerId]) {
      if (!candidate || typeof candidate !== 'string') continue;
      const user = await this.prisma.user.findUnique({
        where: { id: candidate },
        select: { id: true },
      });
      if (user?.id) {
        ownerId = user.id;
        break;
      }
    }
    const originalLang = raw.originalLang ?? raw.lang ?? 'KO';
    const titleOriginal =
      raw.titleOriginal ?? raw.title ?? raw?.project?.titleOriginal;
    const summaryOriginal = raw.summaryOriginal ?? raw.summary ?? '';
    const collaborationTools: string[] = Array.isArray(raw.collaborationTools)
      ? raw.collaborationTools
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
          .map((v: string) => v.trim())
      : [];
    const descriptionBase = raw.descriptionOriginal ?? raw.description ?? '';
    const descriptionOriginal =
      collaborationTools.length > 0
        ? `${descriptionBase}\n\n협업 도구: ${collaborationTools.join(', ')}`
        : descriptionBase;

    if (!ownerId) {
      throw new BadRequestException(
        '유효한 ownerId를 찾지 못했어요. 다시 로그인한 뒤 시도해주세요.',
      );
    }
    if (!titleOriginal)
      throw new BadRequestException('titleOriginal(title)가 필요해요.');

    const mode = raw.mode ?? 'ONLINE';
    const difficulty = raw.difficulty ?? 'MEDIUM';
    const status = raw.status ?? 'PLANNING';
    const capacity = Number(raw.capacity ?? 1);

    const deadline = raw.deadline ? new Date(raw.deadline) : null;
    const startDate = raw.startDate ? new Date(raw.startDate) : null;
    const endDate = raw.endDate ? new Date(raw.endDate) : null;

    const techStackNames: string[] = Array.isArray(raw.techStacks)
      ? raw.techStacks
          .map((t: any) => t?.name ?? t)
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
      : [];

    const positionNeeds: Array<{ position: any; headcount?: number }> =
      Array.isArray(raw.positionNeeds) ? raw.positionNeeds : [];

    const created = await this.prisma.$transaction(async tx => {
      const project = await tx.project.create({
        data: {
          ownerId,
          originalLang,
          titleOriginal,
          summaryOriginal,
          descriptionOriginal,
          mode,
          difficulty,
          status,
          capacity,
          deadline,
          startDate,
          endDate,
        },
      });

      for (const name of techStackNames) {
        const tech = await tx.techStack.upsert({
          where: { name },
          update: {},
          create: { name },
        });

        await tx.projectTechStack.create({
          data: { projectId: project.id, techStackId: tech.id },
        });
      }

      for (const pn of positionNeeds) {
        if (!pn?.position) continue;
        await tx.projectPositionNeed.create({
          data: {
            projectId: project.id,
            position: pn.position,
            headcount: pn.headcount ? Number(pn.headcount) : 1,
          },
        });
      }

      const board = await tx.kanbanBoard.create({
        data: {
          projectId: project.id,
          columns: {
            create: [
              { title: 'TODO', position: 0 },
              { title: 'IN_PROGRESS', position: 1 },
              { title: 'DONE', position: 2 },
            ],
          },
        },
        include: { columns: true },
      });

      // draft artifact를 생성된 프로젝트에 연결
      if (dto.artifactId) {
        const currentArtifact = await tx.aiArtifact.findUnique({
          where: { id: dto.artifactId },
          select: { id: true, revisionBaseId: true },
        });

        if (currentArtifact) {
          const baseId = currentArtifact.revisionBaseId ?? currentArtifact.id;

          await tx.aiArtifact.updateMany({
            where: {
              OR: [{ id: baseId }, { revisionBaseId: baseId }],
            },
            data: { projectId: project.id },
          });
        }
      }

      return { project, board };
    });

    return created;
  }
}
