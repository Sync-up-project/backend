import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationStatus, InviteStatus, Language } from '@prisma/client';

@Injectable()
export class ProjectParticipationService {
  private readonly logger = new Logger(ProjectParticipationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async inviteToProject(
    projectId: string,
    inviterId: string,
    inviteeId: string,
    message?: string,
  ) {
    if (!inviterId) throw new ForbiddenException('로그인이 필요합니다.');
    const targetId = inviteeId?.trim();
    if (!targetId) throw new BadRequestException('초대할 사용자 ID가 필요합니다.');
    if (inviterId === targetId) {
      throw new BadRequestException('본인을 초대할 수 없습니다.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, titleOriginal: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId !== inviterId) {
      throw new ForbiddenException('프로젝트 소유자만 초대할 수 있어요.');
    }

    const invitee = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!invitee) throw new NotFoundException('초대할 사용자를 찾을 수 없어요.');

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetId } },
    });
    if (member) {
      throw new BadRequestException('이미 프로젝트 멤버입니다.');
    }

    const existing = await this.prisma.invitation.findUnique({
      where: { projectId_inviteeId: { projectId, inviteeId: targetId } },
    });
    if (existing?.status === InviteStatus.PENDING) {
      throw new ConflictException('이미 대기 중인 초대가 있습니다.');
    }

    // projectId+inviteeId 유니크이므로 과거 초대(수락/거절)가 있으면 같은 행을 PENDING으로 갱신
    const invitation = existing
      ? await this.prisma.invitation.update({
          where: { id: existing.id },
          data: {
            status: InviteStatus.PENDING,
            inviterId,
            message: message?.trim() || null,
          },
        })
      : await this.prisma.invitation.create({
          data: {
            projectId,
            inviterId,
            inviteeId: targetId,
            message: message?.trim() || null,
            status: InviteStatus.PENDING,
          },
        });

    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { nickname: true },
    });
    const inviterName = inviter?.nickname ?? '팀원';

    const bodyLines = [
      `${inviterName}님이 "${project.titleOriginal}" 프로젝트에 당신을 초대했습니다.`,
      message?.trim() ? `메시지: ${message.trim()}` : null,
      '',
      `프로젝트 ID: ${projectId}`,
      `초대 ID: ${invitation.id}`,
    ].filter(Boolean) as string[];

    try {
      await this.prisma.notification.create({
        data: {
          userId: targetId,
          invitationId: invitation.id,
          type: 'INVITE',
          isRead: false,
          originalLang: Language.KO,
          titleOriginal: `프로젝트 초대: ${project.titleOriginal}`,
          bodyOriginal: bodyLines.join('\n'),
        },
      });
    } catch (err) {
      this.logger.warn(
        `초대 알림 생성 실패 (project=${projectId}, invitation=${invitation.id}): ${String(err)}`,
      );
    }

    return { invitation };
  }

  async applyToProject(projectId: string, applicantId: string, message?: string) {
    if (!applicantId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, titleOriginal: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId === applicantId) {
      throw new BadRequestException('프로젝트 소유자는 참가 신청할 수 없습니다.');
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: applicantId } },
    });
    if (member) {
      throw new BadRequestException('이미 프로젝트 멤버입니다.');
    }

    let application = await this.prisma.application.findUnique({
      where: { projectId_applicantId: { projectId, applicantId } },
    });

    if (application?.status === ApplicationStatus.PENDING) {
      throw new ConflictException('이미 대기 중인 참가 신청이 있습니다.');
    }

    if (application) {
      application = await this.prisma.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.PENDING },
      });
    } else {
      application = await this.prisma.application.create({
        data: {
          projectId,
          applicantId,
          status: ApplicationStatus.PENDING,
        },
      });
    }

    const applicant = await this.prisma.user.findUnique({
      where: { id: applicantId },
      select: { nickname: true },
    });
    const applicantName = applicant?.nickname ?? '사용자';

    const bodyLines = [
      `${applicantName}님이 "${project.titleOriginal}" 프로젝트 참가를 신청했습니다.`,
      message?.trim() ? `신청 메시지: ${message.trim()}` : null,
      '',
      `지원자 ID: ${applicantId}`,
      `신청 ID: ${application.id}`,
      `프로젝트 ID: ${projectId}`,
    ].filter(Boolean) as string[];

    try {
      await this.prisma.notification.create({
        data: {
          userId: project.ownerId,
          applicationId: application.id,
          type: 'APPLICATION',
          isRead: false,
          originalLang: Language.KO,
          titleOriginal: `참가 신청: ${project.titleOriginal}`,
          bodyOriginal: bodyLines.join('\n'),
        },
      });
    } catch (err) {
      this.logger.warn(
        `참가 신청 알림 생성 실패 (project=${projectId}, application=${application.id}): ${String(err)}`,
      );
    }

    return {
      application: {
        id: application.id,
        projectId: application.projectId,
        applicantId: application.applicantId,
        status: application.status,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
    };
  }

  async getMyParticipation(projectId: string, userId: string) {
    if (!userId) {
      return {
        isOwner: false,
        isMember: false,
        pendingInvitation: null,
        pendingApplication: null,
      };
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    const isOwner = project.ownerId === userId;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    const isMember = Boolean(member);

    const pendingInvitation = await this.prisma.invitation.findFirst({
      where: {
        projectId,
        inviteeId: userId,
        status: InviteStatus.PENDING,
      },
      select: { id: true, inviterId: true, message: true, createdAt: true },
    });

    const pendingApplication = await this.prisma.application.findFirst({
      where: {
        projectId,
        applicantId: userId,
        status: ApplicationStatus.PENDING,
      },
      select: { id: true, createdAt: true },
    });

    return {
      isOwner,
      isMember,
      pendingInvitation,
      pendingApplication,
    };
  }

  async listPendingApplications(projectId: string, ownerId: string) {
    if (!ownerId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId !== ownerId) {
      throw new ForbiddenException('프로젝트 소유자만 신청 목록을 볼 수 있어요.');
    }

    const applications = await this.prisma.application.findMany({
      where: { projectId, status: ApplicationStatus.PENDING },
      select: {
        id: true,
        applicantId: true,
        createdAt: true,
        applicant: {
          select: {
            id: true,
            nickname: true,
            role: true,
            profileImageUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { applications };
  }

  async respondToInvitation(invitationId: string, userId: string, accept: boolean) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { project: { select: { id: true, titleOriginal: true, ownerId: true } } },
    });
    if (!invitation) throw new NotFoundException('초대를 찾을 수 없어요.');
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException('초대를 받은 사용자만 응답할 수 있어요.');
    }
    if (invitation.status !== InviteStatus.PENDING) {
      throw new BadRequestException('이미 처리된 초대입니다.');
    }

    if (accept) {
      await this.prisma.$transaction(async tx => {
        await tx.invitation.update({
          where: { id: invitationId },
          data: { status: InviteStatus.ACCEPTED },
        });
        await tx.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: invitation.projectId,
              userId: invitation.inviteeId,
            },
          },
          create: {
            projectId: invitation.projectId,
            userId: invitation.inviteeId,
            roleInProject: null,
          },
          update: {},
        });
      });
    } else {
      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: { status: InviteStatus.REJECTED },
      });
    }

    return { status: accept ? 'ACCEPTED' : 'REJECTED' };
  }

  async respondToApplication(applicationId: string, ownerId: string, accept: boolean) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { project: { select: { id: true, ownerId: true, titleOriginal: true } } },
    });
    if (!application) throw new NotFoundException('신청을 찾을 수 없어요.');
    if (application.project.ownerId !== ownerId) {
      throw new ForbiddenException('프로젝트 소유자만 처리할 수 있어요.');
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청입니다.');
    }

    if (accept) {
      await this.prisma.$transaction(async tx => {
        await tx.application.update({
          where: { id: applicationId },
          data: { status: ApplicationStatus.ACCEPTED },
        });
        await tx.projectMember.upsert({
          where: {
            projectId_userId: {
              projectId: application.projectId,
              userId: application.applicantId,
            },
          },
          create: {
            projectId: application.projectId,
            userId: application.applicantId,
            roleInProject: null,
          },
          update: {},
        });
      });
    } else {
      await this.prisma.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.REJECTED },
      });
    }

    return { status: accept ? 'ACCEPTED' : 'REJECTED' };
  }
}
