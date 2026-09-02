import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

function clampLimit(value?: string, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function clampOffset(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalUsers,
      adminUsers,
      totalProjects,
      activeProjects,
      communityPosts,
      notices,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { accountRole: 'ADMIN' } }),
      this.prisma.project.count(),
      this.prisma.project.count({ where: { status: { not: 'CANCELED' } } }),
      this.prisma.communityPost.count(),
      this.prisma.notice.count(),
    ]);

    return {
      totalUsers,
      adminUsers,
      totalProjects,
      activeProjects,
      communityPosts,
      notices,
    };
  }

  async listUsers(query: { q?: string; limit?: string; offset?: string }) {
    const limit = clampLimit(query.limit, 30);
    const offset = clampOffset(query.offset);
    const q = query.q?.trim();

    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { nickname: { contains: q, mode: 'insensitive' as const } },
            { githubUsername: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          accountRole: true,
          primaryLanguage: true,
          githubUsername: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              ownedProjects: true,
              memberships: true,
              communityPosts: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listProjects(query: { q?: string; limit?: string; offset?: string }) {
    const limit = clampLimit(query.limit, 30);
    const offset = clampOffset(query.offset);
    const q = query.q?.trim();

    const where = q
      ? {
          OR: [
            { titleOriginal: { contains: q, mode: 'insensitive' as const } },
            { summaryOriginal: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          titleOriginal: true,
          summaryOriginal: true,
          status: true,
          difficulty: true,
          mode: true,
          capacity: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              email: true,
              nickname: true,
            },
          },
          _count: {
            select: {
              members: true,
              applications: true,
              invitations: true,
            },
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listCommunityPosts(query: { q?: string; limit?: string; offset?: string }) {
    const limit = clampLimit(query.limit, 30);
    const offset = clampOffset(query.offset);
    const q = query.q?.trim();

    const where = q
      ? {
          OR: [
            { titleOriginal: { contains: q, mode: 'insensitive' as const } },
            { contentOriginal: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          category: true,
          titleOriginal: true,
          likeCount: true,
          commentCount: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: { id: true, email: true, nickname: true },
          },
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listNotices(query: { q?: string; limit?: string; offset?: string }) {
    const limit = clampLimit(query.limit, 30);
    const offset = clampOffset(query.offset);
    const q = query.q?.trim();

    const where = q
      ? {
          OR: [
            { titleOriginal: { contains: q, mode: 'insensitive' as const } },
            { contentOriginal: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.notice.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          pinned: true,
          titleOriginal: true,
          viewCount: true,
          createdAt: true,
          author: {
            select: { id: true, email: true, nickname: true },
          },
        },
      }),
      this.prisma.notice.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listAuditLogs(query: { limit?: string; offset?: string }) {
    const limit = clampLimit(query.limit, 50);
    const offset = clampOffset(query.offset);

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          diffJson: true,
          createdAt: true,
          actor: {
            select: { id: true, email: true, nickname: true, accountRole: true },
          },
          project: {
            select: { id: true, titleOriginal: true },
          },
        },
      }),
      this.prisma.auditLog.count(),
    ]);

    return { items, total, limit, offset };
  }

  async writeAudit(actorId: string, summary: string, entityType = 'AdminPage') {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: AuditAction.CREATE,
        entityType,
        summary,
      },
    });
  }
}
