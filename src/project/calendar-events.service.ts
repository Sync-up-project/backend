import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

type FindAllQuery = {
  from?: string;
  to?: string;
  type?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  includeDone?: string;
  sort?: string;
  q?: string;
};

@Injectable()
export class CalendarEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private rethrowSchemaMismatchIfNeeded(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    // 주로 "column ... does not exist" / "Unknown arg ..." 류로 나타납니다 (마이그레이션 미적용, prisma client 불일치 등)
    if (
      /column .* does not exist/i.test(message) ||
      /Unknown arg/i.test(message) ||
      /Invalid .* invocation/i.test(message)
    ) {
      throw new InternalServerErrorException(
        '서버 DB 스키마가 최신이 아닙니다. 백엔드에서 Prisma migration을 적용한 뒤 다시 시도해 주세요. (예: docker compose exec backend npx prisma migrate deploy)',
      );
    }
    throw err instanceof Error ? err : new InternalServerErrorException(message);
  }

  private norm(value: string | null | undefined): string {
    return String(value ?? '').trim().toUpperCase();
  }

  private isDoneStatus(value: string | null | undefined): boolean {
    const s = this.norm(value);
    return s === 'DONE' || s === 'COMPLETED' || s === 'FINISHED';
  }

  private parseDateOrThrow(value: string, fieldName: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid date string`);
    }
    return d;
  }

  private async assertProjectAndAccess(projectId: string, userId: string) {
    if (!userId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    if (project.ownerId === userId) return project;

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('프로젝트 멤버만 접근할 수 있어요.');

    return project;
  }

  private async assertAssigneesAreMembersOrOwner(
    projectId: string,
    ownerId: string,
    assigneeIds: string[],
  ) {
    if (assigneeIds.length === 0) return;

    const uniqueIds = Array.from(new Set(assigneeIds.map(v => v.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const memberRows = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: uniqueIds } },
      select: { userId: true },
    });
    const memberIdSet = new Set(memberRows.map(r => r.userId));

    for (const id of uniqueIds) {
      if (id === ownerId) continue;
      if (!memberIdSet.has(id)) {
        throw new BadRequestException('담당자는 프로젝트 멤버(또는 오너)여야 합니다.');
      }
    }
  }

  async findAll(projectId: string, userId: string, query: FindAllQuery) {
    await this.assertProjectAndAccess(projectId, userId);

    const where: any = { projectId };
    const from = query.from?.trim();
    const to = query.to?.trim();
    const type = query.type?.trim();
    const status = query.status?.trim();
    const priority = query.priority?.trim();
    const assigneeId = query.assigneeId?.trim();
    const includeDone = this.norm(query.includeDone) === 'TRUE';
    const sort = query.sort?.trim();
    const q = query.q?.trim();

    // 기간 필터: 요청 기간과 "겹치는" 이벤트를 반환합니다.
    // - from: endAt >= from
    // - to:   startAt <= to
    if (from) {
      const fromDate = this.parseDateOrThrow(from, 'from');
      where.endAt = { gte: fromDate };
    }
    if (to) {
      const toDate = this.parseDateOrThrow(to, 'to');
      where.startAt = { ...(where.startAt ?? {}), lte: toDate };
    }

    if (type) where.type = this.norm(type);
    if (status) where.status = this.norm(status);
    if (priority) where.priority = this.norm(priority);
    if (assigneeId) where.assignees = { some: { userId: assigneeId } };

    // 기본: 완료(DONE) 작업은 숨김 (필터로 포함 가능)
    if (!includeDone && !status) {
      where.status = { notIn: ['DONE', 'COMPLETED', 'FINISHED'] };
    }

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { memo: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderBy: any[] = (() => {
      const s = this.norm(sort);
      if (s === 'DUE_ASC') return [{ endAt: 'asc' }, { startAt: 'asc' }];
      if (s === 'CREATED_DESC') return [{ createdAt: 'desc' }];
      if (s === 'PRIORITY_DESC') return [{ priority: 'desc' }, { endAt: 'asc' }];
      if (s === 'PROGRESS_ASC') return [{ progress: 'asc' }, { endAt: 'asc' }];
      if (s === 'STATUS') return [{ status: 'asc' }, { endAt: 'asc' }];
      return [{ order: 'asc' }, { startAt: 'asc' }];
    })();

    const events = await this.prisma.projectCalendarEvent.findMany({
      where,
      orderBy,
      include: {
        createdBy: { select: { id: true, nickname: true, profileImageUrl: true } },
        assignees: {
          include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
        },
      },
    });

    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const enriched = events.map((e: any) => {
      const done = this.isDoneStatus(e.status) || Boolean(e.completedAt);
      const end = new Date(e.endAt);
      const overdue = !done && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
      const dueSoon =
        !done &&
        !Number.isNaN(end.getTime()) &&
        end.getTime() >= now.getTime() &&
        end.getTime() <= dueSoonCutoff.getTime();
      return { ...e, isCompleted: done, overdue, dueSoon };
    });

    return { events: enriched };
  }

  async create(projectId: string, userId: string, dto: CreateCalendarEventDto) {
    const project = await this.assertProjectAndAccess(projectId, userId);

    const startAt = this.parseDateOrThrow(dto.startAt, 'startAt');
    const endAt = this.parseDateOrThrow(dto.endAt, 'endAt');
    if (startAt.getTime() > endAt.getTime()) {
      throw new BadRequestException('startAt must be before or equal to endAt');
    }

    const assigneeIds = Array.from(new Set((dto.assigneeIds ?? []).map(v => v.trim()).filter(Boolean)));
    await this.assertAssigneesAreMembersOrOwner(projectId, project.ownerId, assigneeIds);

    const type = dto.type?.trim() ? this.norm(dto.type) : 'TASK';
    const status = dto.status?.trim() ? this.norm(dto.status) : 'TODO';
    const priority = dto.priority?.trim() ? this.norm(dto.priority) : 'MEDIUM';
    const progress = dto.progress === undefined || dto.progress === null ? 0 : Number(dto.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new BadRequestException('progress must be between 0 and 100');
    }
    const memo = dto.memo === undefined ? undefined : dto.memo?.trim() ? dto.memo.trim() : null;

    const last = await this.prisma.projectCalendarEvent.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? 0) + 1;

    const done = this.isDoneStatus(status);
    const event = await this.prisma.projectCalendarEvent
      .create({
        data: {
          projectId,
          title: dto.title.trim(),
          description: dto.description?.trim() ? dto.description.trim() : null,
          startAt,
          endAt,
          isAllDay: dto.isAllDay ?? false,
          type,
          status,
          priority,
          progress: done ? 100 : progress,
          memo,
          completedAt: done ? new Date() : null,
          order: nextOrder,
          createdById: userId,
          assignees: assigneeIds.length
            ? {
                create: assigneeIds.map(id => ({
                  userId: id,
                })),
              }
            : undefined,
        },
        include: {
          createdBy: { select: { id: true, nickname: true, profileImageUrl: true } },
          assignees: {
            include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
          },
        },
      })
      .catch((e: unknown) => this.rethrowSchemaMismatchIfNeeded(e));

    return { event };
  }

  async createBulk(projectId: string, userId: string, dtos: CreateCalendarEventDto[]) {
    const project = await this.assertProjectAndAccess(projectId, userId);

    if (!dtos.length) {
      throw new BadRequestException('이벤트가 비어 있습니다.');
    }
    if (dtos.length > 40) {
      throw new BadRequestException('한 번에 최대 40건까지 등록할 수 있어요.');
    }

    const last = await this.prisma.projectCalendarEvent.findFirst({
      where: { projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    let nextOrder = last?.order ?? 0;

    const rows = await this.prisma.$transaction(async tx => {
      const createdList: Array<Record<string, unknown>> = [];
      for (const dto of dtos) {
        nextOrder += 1;

        const startAt = this.parseDateOrThrow(dto.startAt, 'startAt');
        const endAt = this.parseDateOrThrow(dto.endAt, 'endAt');
        if (startAt.getTime() > endAt.getTime()) {
          throw new BadRequestException('startAt must be before or equal to endAt');
        }

        const assigneeIds = Array.from(
          new Set((dto.assigneeIds ?? []).map(v => v.trim()).filter(Boolean)),
        );
        await this.assertAssigneesAreMembersOrOwner(projectId, project.ownerId, assigneeIds);

        const type = dto.type?.trim() ? this.norm(dto.type) : 'TASK';
        const status = dto.status?.trim() ? this.norm(dto.status) : 'TODO';
        const priority = dto.priority?.trim() ? this.norm(dto.priority) : 'MEDIUM';
        const progress =
          dto.progress === undefined || dto.progress === null ? 0 : Number(dto.progress);
        if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
          throw new BadRequestException('progress must be between 0 and 100');
        }
        const memo =
          dto.memo === undefined ? undefined : dto.memo?.trim() ? dto.memo.trim() : null;

        const done = this.isDoneStatus(status);
        const event = await tx.projectCalendarEvent
          .create({
            data: {
              projectId,
              title: dto.title.trim(),
              description: dto.description?.trim() ? dto.description.trim() : null,
              startAt,
              endAt,
              isAllDay: dto.isAllDay ?? false,
              type,
              status,
              priority,
              progress: done ? 100 : progress,
              memo,
              completedAt: done ? new Date() : null,
              order: nextOrder,
              createdById: userId,
              assignees: assigneeIds.length
                ? {
                    create: assigneeIds.map(uid => ({
                      userId: uid,
                    })),
                  }
                : undefined,
            },
            include: {
              createdBy: { select: { id: true, nickname: true, profileImageUrl: true } },
              assignees: {
                include: {
                  user: { select: { id: true, nickname: true, profileImageUrl: true } },
                },
              },
            },
          })
          .catch((e: unknown) => this.rethrowSchemaMismatchIfNeeded(e));
        createdList.push(event);
      }
      return createdList;
    });

    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const enriched = rows.map((e: any) => {
      const done = this.isDoneStatus(e.status) || Boolean(e.completedAt);
      const end = new Date(e.endAt);
      const overdue = !done && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
      const dueSoon =
        !done &&
        !Number.isNaN(end.getTime()) &&
        end.getTime() >= now.getTime() &&
        end.getTime() <= dueSoonCutoff.getTime();
      return { ...e, isCompleted: done, overdue, dueSoon };
    });

    return { events: enriched, created: enriched.length };
  }

  async update(
    projectId: string,
    eventId: string,
    userId: string,
    dto: UpdateCalendarEventDto,
  ) {
    const project = await this.assertProjectAndAccess(projectId, userId);

    const existing = await this.prisma.projectCalendarEvent.findUnique({
      where: { id: eventId },
      include: { assignees: true },
    });
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('일정을 찾을 수 없어요.');
    }

    const isOwner = project.ownerId === userId;
    const isAuthor = Boolean(existing.createdById) && existing.createdById === userId;
    const isAssignee = existing.assignees.some(a => a.userId === userId);
    if (!isOwner && !isAuthor && !isAssignee) {
      throw new ForbiddenException('프로젝트 오너/작성자/담당자만 수정할 수 있어요.');
    }

    const assigneeOnlyAllowed = new Set(['status', 'progress', 'memo']);
    if (!isOwner && !isAuthor && isAssignee) {
      const providedKeys = Object.entries(dto)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
      const invalid = providedKeys.filter(k => !assigneeOnlyAllowed.has(k));
      if (invalid.length > 0) {
        throw new ForbiddenException('담당자는 status/progress/memo만 수정할 수 있어요.');
      }
    }

    const nextStartAt = dto.startAt ? this.parseDateOrThrow(dto.startAt, 'startAt') : existing.startAt;
    const nextEndAt = dto.endAt ? this.parseDateOrThrow(dto.endAt, 'endAt') : existing.endAt;
    if ((dto.startAt || dto.endAt) && nextStartAt.getTime() > nextEndAt.getTime()) {
      throw new BadRequestException('startAt must be before or equal to endAt');
    }

    const assigneeIds = dto.assigneeIds
      ? Array.from(new Set(dto.assigneeIds.map(v => v.trim()).filter(Boolean)))
      : null;
    if (assigneeIds) {
      await this.assertAssigneesAreMembersOrOwner(projectId, project.ownerId, assigneeIds);
    }

    const nextStatus = dto.status?.trim() ? this.norm(dto.status) : this.norm(existing.status);
    const nextType = dto.type?.trim() ? this.norm(dto.type) : undefined;
    const nextPriority = dto.priority?.trim() ? this.norm(dto.priority) : undefined;

    const nextProgress =
      dto.progress === undefined || dto.progress === null ? undefined : Number(dto.progress);
    if (nextProgress !== undefined) {
      if (!Number.isFinite(nextProgress) || nextProgress < 0 || nextProgress > 100) {
        throw new BadRequestException('progress must be between 0 and 100');
      }
    }

    const doneBefore = this.isDoneStatus(existing.status) || Boolean(existing.completedAt);
    const doneAfter = this.isDoneStatus(nextStatus);

    const event = await this.prisma.$transaction(async tx => {
      if (assigneeIds && (isOwner || isAuthor)) {
        await tx.projectCalendarEventAssignee.deleteMany({ where: { eventId } });
        if (assigneeIds.length > 0) {
          await tx.projectCalendarEventAssignee.createMany({
            data: assigneeIds.map(userId2 => ({ eventId, userId: userId2 })),
            skipDuplicates: true,
          });
        }
      } else if (assigneeIds && !(isOwner || isAuthor)) {
        throw new ForbiddenException('담당자 변경은 작성자 또는 오너만 할 수 있어요.');
      }

      const memo =
        dto.memo === undefined ? undefined : dto.memo?.trim() ? dto.memo.trim() : null;

      const completedAt =
        doneAfter && !doneBefore
          ? new Date()
          : !doneAfter && doneBefore
          ? null
          : undefined;

      const progress =
        doneAfter
          ? 100
          : nextProgress !== undefined
          ? nextProgress
          : undefined;

      return tx.projectCalendarEvent
        .update({
          where: { id: eventId },
          data: {
            title: dto.title?.trim() ? dto.title.trim() : undefined,
            description:
              dto.description === undefined
                ? undefined
                : dto.description?.trim()
                ? dto.description.trim()
                : null,
            startAt: dto.startAt ? nextStartAt : undefined,
            endAt: dto.endAt ? nextEndAt : undefined,
            isAllDay: dto.isAllDay ?? undefined,
            type: nextType,
            status: dto.status === undefined ? undefined : nextStatus,
            priority: nextPriority,
            progress,
            memo,
            completedAt,
            order: dto.order === undefined ? undefined : dto.order,
          },
          include: {
            createdBy: { select: { id: true, nickname: true, profileImageUrl: true } },
            assignees: {
              include: { user: { select: { id: true, nickname: true, profileImageUrl: true } } },
            },
          },
        })
        .catch((e: unknown) => this.rethrowSchemaMismatchIfNeeded(e));
    });

    return { event };
  }

  async remove(projectId: string, eventId: string, userId: string) {
    const project = await this.assertProjectAndAccess(projectId, userId);

    const existing = await this.prisma.projectCalendarEvent.findUnique({
      where: { id: eventId },
      select: { id: true, projectId: true, createdById: true },
    });
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundException('일정을 찾을 수 없어요.');
    }

    const isOwner = project.ownerId === userId;
    const isAuthor = Boolean(existing.createdById) && existing.createdById === userId;
    if (!isOwner && !isAuthor) {
      // TODO(assignee 권한 확장): assignee에게 특정 필드 삭제 권한을 부여하려면 정책을 구체화하세요.
      throw new ForbiddenException('일정 작성자 또는 프로젝트 오너만 삭제할 수 있어요.');
    }

    await this.prisma.projectCalendarEvent.delete({ where: { id: eventId } });
    return { message: '일정이 삭제되었습니다.' };
  }

  async summary(projectId: string, userId: string) {
    const project = await this.assertProjectAndAccess(projectId, userId);

    const projectWithMembers = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerId: true,
        owner: { select: { id: true, nickname: true, email: true, role: true } },
        members: {
          include: {
            user: { select: { id: true, nickname: true, email: true, role: true } },
          },
        },
      },
    });
    if (!projectWithMembers) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    const tasks = await this.prisma.projectCalendarEvent.findMany({
      where: { projectId, type: 'TASK' },
      orderBy: [{ order: 'asc' }, { endAt: 'asc' }],
      include: {
        assignees: {
          include: { user: { select: { id: true, nickname: true, email: true, profileImageUrl: true } } },
        },
      },
    });

    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const enriched = tasks.map((t: any) => {
      const done = this.isDoneStatus(t.status) || Boolean(t.completedAt);
      const end = new Date(t.endAt);
      const overdue = !done && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
      const dueSoon =
        !done &&
        !Number.isNaN(end.getTime()) &&
        end.getTime() >= now.getTime() &&
        end.getTime() <= dueSoonCutoff.getTime();
      return { ...t, isCompleted: done, overdue, dueSoon };
    });

    const counts = {
      totalTasks: enriched.length,
      todoTasks: 0,
      inProgressTasks: 0,
      reviewTasks: 0,
      doneTasks: 0,
      blockedTasks: 0,
      overdueTasks: 0,
      dueSoonTasks: 0,
      averageProgress: 0,
    };

    let progressSum = 0;
    for (const t of enriched) {
      const s = this.norm(t.status);
      if (s === 'TODO' || s === 'PLANNED') counts.todoTasks += 1;
      else if (s === 'IN_PROGRESS') counts.inProgressTasks += 1;
      else if (s === 'REVIEW') counts.reviewTasks += 1;
      else if (this.isDoneStatus(s)) counts.doneTasks += 1;
      else if (s === 'BLOCKED') counts.blockedTasks += 1;

      if (t.overdue) counts.overdueTasks += 1;
      if (t.dueSoon) counts.dueSoonTasks += 1;
      progressSum += Number(t.progress ?? 0);
    }
    counts.averageProgress = enriched.length ? Math.round(progressSum / enriched.length) : 0;

    const memberEntries: Array<{
      userId: string;
      nickname: string | null;
      email: string | null;
      roleInProject: string | null;
      position: string | null;
    }> = [];

    memberEntries.push({
      userId: projectWithMembers.owner.id,
      nickname: projectWithMembers.owner.nickname ?? null,
      email: projectWithMembers.owner.email ?? null,
      roleInProject: 'OWNER',
      position: projectWithMembers.owner.role ? String(projectWithMembers.owner.role) : null,
    });

    for (const m of projectWithMembers.members) {
      memberEntries.push({
        userId: m.userId,
        nickname: m.user.nickname ?? null,
        email: m.user.email ?? null,
        roleInProject: m.roleInProject ?? null,
        position: m.user.role ? String(m.user.role) : null,
      });
    }

    const memberMap = new Map<string, any>();
    for (const m of memberEntries) {
      memberMap.set(m.userId, {
        ...m,
        assignedTasks: 0,
        doneTasks: 0,
        inProgressTasks: 0,
        averageProgress: 0,
        overdueTasks: 0,
        currentTasks: [] as any[],
        doneTaskList: [] as any[],
      });
    }

    for (const t of enriched) {
      const assigneeIds = (t.assignees ?? []).map((a: any) => a.userId);
      for (const aid of assigneeIds) {
        const entry = memberMap.get(aid);
        if (!entry) continue;
        entry.assignedTasks += 1;
        entry.averageProgress += Number(t.progress ?? 0);
        if (t.overdue) entry.overdueTasks += 1;
        if (this.isDoneStatus(t.status) || t.isCompleted) {
          entry.doneTasks += 1;
          entry.doneTaskList.push(t);
        }
        if (this.norm(t.status) === 'IN_PROGRESS' || this.norm(t.status) === 'REVIEW') {
          entry.inProgressTasks += 1;
        }
        if (!t.isCompleted) entry.currentTasks.push(t);
      }
    }

    const members = Array.from(memberMap.values()).map((m: any) => {
      const denom = m.assignedTasks || 0;
      const avg = denom ? Math.round(m.averageProgress / denom) : 0;
      return { ...m, averageProgress: avg };
    });

    return { ...counts, members, project: { id: project.id, ownerId: project.ownerId } };
  }
}
