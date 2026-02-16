import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfirmProjectDto } from './dto/confirm-project.dto';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

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

    return projects.map((project) => {
      const membersCount = project.members.length + 1; // +1은 소유자
      const membersCountMax = project.capacity;

      const techStacks = project.techStacks.map((pt) => ({
        id: pt.techStack.id,
        name: pt.techStack.name,
      }));

      const positionNeeds = project.positionNeeds.map((pn) => ({
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
        techStacks: { include: { techStack: { select: { id: true, name: true } } } },
        positionNeeds: { select: { id: true, position: true, headcount: true } },
        members: { select: { id: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // “새 API”는 보통 list 형태를 그대로 반환하는 편이 좋아서 items로 내릴게
    // (원하면 project: [...] 형태로 바꿔도 됨)
    return {
      items: projects.map((p) => ({
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
        techStacks: p.techStacks.map((pt) => ({
          id: pt.techStack.id,
          name: pt.techStack.name,
        })),
        positionNeeds: p.positionNeeds.map((pn) => ({
          id: pn.id,
          position: pn.position,
          headcount: pn.headcount,
        })),
        membersCount: p.members.length + 1, // owner 포함
      })),
      nextCursor: null, // 나중에 페이지네이션 붙일 때 사용
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
              select: { id: true, nickname: true, profileImageUrl: true, role: true },
            },
          },
        },
      },
    });

    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    return project;
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
                    user: { select: { id: true, nickname: true, profileImageUrl: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // 보드가 없으면 null로 주거나(프론트에서 init 유도), 여기서 자동 생성해도 됨.
    // 지금은 “없으면 null”로 줄게. (원하면 자동 생성도 넣어줄게!)
    return board;
  }

  /**
   * ✅ POST /projects/confirm
   * - artifact 기반 생성
   *
   * ⚠️ ConfirmProjectDto 구조를 네가 안 보여줘서:
   *   1) dto.project 같은 “명시적 필드”가 있으면 그걸 우선 사용
   *   2) dto.artifact/contentJson 형태면 거기에서 꺼내오도록 방어적으로 작성
   *
   * DTO 필드명만 너 프로젝트에 맞게 2~3군데 바꾸면 바로 실사용 가능!
   */
  async confirmFromArtifact(dto: ConfirmProjectDto) {
    // ---- 1) 입력 파싱(방어적으로) ----
    // 아래 3줄은 “가능한 후보”에서 값 꺼내는 방식이야.
    // 네 ConfirmProjectDto에 맞춰 여기만 맞추면 끝!
    const raw: any =
      (dto as any).project ??
      (dto as any).artifact ??
      (dto as any).contentJson ??
      dto;

    const ownerId = raw.ownerId;
    const originalLang = raw.originalLang ?? raw.lang ?? 'KO';
    const titleOriginal = raw.titleOriginal ?? raw.title ?? raw?.project?.titleOriginal;
    const summaryOriginal = raw.summaryOriginal ?? raw.summary ?? '';
    const descriptionOriginal = raw.descriptionOriginal ?? raw.description ?? '';

    if (!ownerId) throw new BadRequestException('ownerId가 필요해요.');
    if (!titleOriginal) throw new BadRequestException('titleOriginal(title)가 필요해요.');

    const mode = raw.mode ?? 'ONLINE';
    const difficulty = raw.difficulty ?? 'MEDIUM';
    const status = raw.status ?? 'PLANNING';
    const capacity = Number(raw.capacity ?? 1);

    const deadline = raw.deadline ? new Date(raw.deadline) : null;
    const startDate = raw.startDate ? new Date(raw.startDate) : null;
    const endDate = raw.endDate ? new Date(raw.endDate) : null;

    // techStacks: [{ name: "React" }, { id: "..." }] 같은 형태를 넓게 수용
    const techStackNames: string[] = Array.isArray(raw.techStacks)
      ? raw.techStacks
          .map((t: any) => t?.name ?? t)
          .filter((v: any) => typeof v === 'string' && v.trim().length > 0)
      : [];

    // positionNeeds: [{ position: "DEV", headcount: 2 }] 형태 수용
    const positionNeeds: Array<{ position: any; headcount?: number }> = Array.isArray(raw.positionNeeds)
      ? raw.positionNeeds
      : [];

    // ---- 2) 트랜잭션으로 생성 ----
    const created = await this.prisma.$transaction(async (tx) => {
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

      // (d) KanbanBoard 기본 생성(원하면 컬럼 3개 자동)
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
}