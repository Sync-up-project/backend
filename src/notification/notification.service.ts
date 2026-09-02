import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

function parseLimit(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function pickProject(notification: any) {
  const project =
    notification?.invitation?.project ??
    notification?.application?.project ??
    null;

  if (!project) return null;
  return {
    id: project.id,
    title: project.titleOriginal,
  };
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, limit?: string) {
    const take = parseLimit(limit);

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          i18n: true,
          invitation: {
            select: {
              id: true,
              status: true,
              project: { select: { id: true, titleOriginal: true } },
            },
          },
          application: {
            select: {
              id: true,
              status: true,
              project: { select: { id: true, titleOriginal: true } },
            },
          },
        },
      }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return {
      items: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        isRead: notification.isRead,
        originalLang: notification.originalLang,
        title: notification.titleOriginal,
        body: notification.bodyOriginal,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
        invitation: notification.invitation
          ? {
              id: notification.invitation.id,
              status: notification.invitation.status,
            }
          : null,
        application: notification.application
          ? {
              id: notification.application.id,
              status: notification.application.status,
            }
          : null,
        project: pickProject(notification),
        i18n: notification.i18n.map(item => ({
          lang: item.lang,
          title: item.title,
          body: item.body,
        })),
      })),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { ok: true, count: result.count };
  }
}
