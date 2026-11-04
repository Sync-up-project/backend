import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplicationStatus,
  InviteStatus,
  Language,
  MemberRemovalStatus,
} from '@prisma/client';

@Injectable()
export class ProjectParticipationService {
  private readonly logger = new Logger(ProjectParticipationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 알림 생성 공통 함수
   * - 수락/거절 등 본 작업이 끝난 뒤 호출합니다.
   * - 알림 생성이 실패해도 본 작업은 되돌리지 않고 경고 로그만 남깁니다.
   */
  private async notify(params: {
    userId: string;
    type: string;
    title: string;
    body: string;
    invitationId?: string;
    applicationId?: string;
  }) {
    try {
      await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          isRead: false,
          originalLang: Language.KO,
          titleOriginal: params.title,
          bodyOriginal: params.body,
          invitationId: params.invitationId,
          applicationId: params.applicationId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `알림 생성 실패 (type=${params.type}, user=${params.userId}): ${String(err)}`,
      );
    }
  }

  private async getNickname(userId: string, fallback: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });
    return user?.nickname ?? fallback;
  }

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

    const inviterName = await this.getNickname(inviterId, '팀원');

    const bodyLines = [
      `${inviterName}님이 "${project.titleOriginal}" 프로젝트에 당신을 초대했습니다.`,
      message?.trim() ? `메시지: ${message.trim()}` : null,
      '',
      `프로젝트 ID: ${projectId}`,
      `초대 ID: ${invitation.id}`,
    ].filter(Boolean) as string[];

    await this.notify({
      userId: targetId,
      type: 'INVITE',
      invitationId: invitation.id,
      title: `프로젝트 초대: ${project.titleOriginal}`,
      body: bodyLines.join('\n'),
    });

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

    const applicantName = await this.getNickname(applicantId, '사용자');

    const bodyLines = [
      `${applicantName}님이 "${project.titleOriginal}" 프로젝트 참가를 신청했습니다.`,
      message?.trim() ? `신청 메시지: ${message.trim()}` : null,
      '',
      `지원자 ID: ${applicantId}`,
      `신청 ID: ${application.id}`,
      `프로젝트 ID: ${projectId}`,
    ].filter(Boolean) as string[];

    await this.notify({
      userId: project.ownerId,
      type: 'APPLICATION',
      applicationId: application.id,
      title: `참가 신청: ${project.titleOriginal}`,
      body: bodyLines.join('\n'),
    });

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

  async listProjectMembers(projectId: string, userId: string) {
    if (!userId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
            role: true,
          },
        },
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
          orderBy: { joinedAt: 'asc' },
        },
        memberRemovalRequests: {
          where: { status: MemberRemovalStatus.PENDING },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');

    const isOwner = project.ownerId === userId;
    const isMember = project.members.some(member => member.userId === userId);
    if (!isOwner && !isMember) {
      throw new ForbiddenException('프로젝트 멤버만 볼 수 있어요.');
    }

    return {
      owner: project.owner,
      members: project.members.map(member => ({
        id: member.id,
        userId: member.userId,
        roleInProject: member.roleInProject,
        joinedAt: member.joinedAt,
        user: member.user,
      })),
      removalRequests: project.memberRemovalRequests,
    };
  }

  async requestMemberRemoval(projectId: string, actorId: string, targetUserId: string) {
    if (!actorId) throw new ForbiddenException('로그인이 필요합니다.');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, titleOriginal: true },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없어요.');
    if (project.ownerId === targetUserId) {
      throw new BadRequestException('프로젝트 소유자는 퇴장 요청 대상이 될 수 없습니다.');
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { id: true, userId: true },
    });
    if (!member) throw new NotFoundException('프로젝트 멤버를 찾을 수 없어요.');

    const actorIsOwner = project.ownerId === actorId;
    const actorIsTarget = targetUserId === actorId;
    if (!actorIsOwner && !actorIsTarget) {
      throw new ForbiddenException('오너 또는 해당 멤버만 퇴장 요청을 만들 수 있어요.');
    }

    const existing = await this.prisma.projectMemberRemovalRequest.findFirst({
      where: {
        projectId,
        targetUserId,
        status: MemberRemovalStatus.PENDING,
      },
    });

    if (existing) return { request: existing };

    const now = new Date();
    const request = await this.prisma.projectMemberRemovalRequest.create({
      data: {
        projectId,
        projectMemberId: member.id,
        targetUserId,
        requestedById: actorId,
        ownerApprovedAt: actorIsOwner ? now : null,
        memberApprovedAt: actorIsTarget ? now : null,
      },
    });

    // 퇴장은 오너와 멤버 양쪽 동의가 필요하므로, 요청하지 않은 쪽에 알림
    const projectTitle = project.titleOriginal;
    if (actorIsOwner && !actorIsTarget) {
      await this.notify({
        userId: targetUserId,
        type: 'MEMBER_REMOVAL_REQUEST',
        title: `퇴장 요청: ${projectTitle}`,
        body: `프로젝트 오너가 "${projectTitle}" 프로젝트에서 퇴장을 요청했습니다. 프로젝트 페이지에서 확인 후 동의해주세요.`,
      });
    } else {
      const targetName = await this.getNickname(targetUserId, '팀원');
      await this.notify({
        userId: project.ownerId,
        type: 'MEMBER_REMOVAL_REQUEST',
        title: `퇴장 요청: ${projectTitle}`,
        body: `${targetName}님이 "${projectTitle}" 프로젝트에서 나가기를 요청했습니다. 프로젝트 관리 페이지에서 확인해주세요.`,
      });
    }

    return { request };
  }

  async approveMemberRemoval(projectId: string, requestId: string, actorId: string) {
    if (!actorId) throw new ForbiddenException('로그인이 필요합니다.');

    const request = await this.prisma.projectMemberRemovalRequest.findUnique({
      where: { id: requestId },
      include: {
        project: { select: { id: true, ownerId: true, titleOriginal: true } },
        projectMember: { select: { id: true, projectId: true, userId: true } },
      },
    });

    if (!request || request.projectId !== projectId) {
      throw new NotFoundException('퇴장 요청을 찾을 수 없어요.');
    }
    if (request.status !== MemberRemovalStatus.PENDING) {
      throw new BadRequestException('이미 처리된 퇴장 요청입니다.');
    }

    const actorIsOwner = request.project.ownerId === actorId;
    const actorIsTarget = request.targetUserId === actorId;
    if (!actorIsOwner && !actorIsTarget) {
      throw new ForbiddenException('오너 또는 해당 멤버만 동의할 수 있어요.');
    }

    const ownerApprovedAt = request.ownerApprovedAt ?? (actorIsOwner ? new Date() : null);
    const memberApprovedAt =
      request.memberApprovedAt ?? (actorIsTarget ? new Date() : null);

    if (ownerApprovedAt && memberApprovedAt) {
      await this.prisma.$transaction(async tx => {
        await tx.projectMemberRemovalRequest.update({
          where: { id: request.id },
          data: {
            ownerApprovedAt,
            memberApprovedAt,
            status: MemberRemovalStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await tx.projectMember.delete({
          where: { id: request.projectMemberId },
        });
      });

      // 퇴장 완료 알림: 마지막에 동의한 사람이 아닌 쪽에 알림
      const projectTitle = request.project.titleOriginal;
      if (actorIsOwner) {
        await this.notify({
          userId: request.targetUserId,
          type: 'MEMBER_REMOVED',
          title: `프로젝트 퇴장 완료: ${projectTitle}`,
          body: `"${projectTitle}" 프로젝트에서 퇴장 처리되었습니다.`,
        });
      } else {
        const targetName = await this.getNickname(request.targetUserId, '팀원');
        await this.notify({
          userId: request.project.ownerId,
          type: 'MEMBER_REMOVED',
          title: `팀원 퇴장 완료: ${projectTitle}`,
          body: `${targetName}님이 "${projectTitle}" 프로젝트에서 퇴장했습니다.`,
        });
      }

      return { status: MemberRemovalStatus.COMPLETED };
    }

    const updated = await this.prisma.projectMemberRemovalRequest.update({
      where: { id: request.id },
      data: {
        ownerApprovedAt,
        memberApprovedAt,
      },
    });

    return { status: updated.status, request: updated };
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

    // 초대를 보낸 사람에게 응답 결과 알림
    const projectTitle = invitation.project.titleOriginal;
    const inviteeName = await this.getNickname(invitation.inviteeId, '초대한 사용자');
    await this.notify({
      userId: invitation.inviterId,
      type: 'INVITE_STATUS',
      invitationId: invitation.id,
      title: accept
        ? `초대 수락: ${projectTitle}`
        : `초대 거절: ${projectTitle}`,
      body: accept
        ? `${inviteeName}님이 "${projectTitle}" 프로젝트 초대를 수락했습니다.`
        : `${inviteeName}님이 "${projectTitle}" 프로젝트 초대를 거절했습니다.`,
    });

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

    // 지원자에게 신청 결과 알림
    const projectTitle = application.project.titleOriginal;
    await this.notify({
      userId: application.applicantId,
      type: 'APPLICATION_STATUS',
      applicationId: application.id,
      title: accept
        ? `참가 신청 수락: ${projectTitle}`
        : `참가 신청 결과: ${projectTitle}`,
      body: accept
        ? `"${projectTitle}" 프로젝트 참가 신청이 수락되었습니다. 이제 팀원으로 참여할 수 있어요.`
        : `"${projectTitle}" 프로젝트 참가 신청이 거절되었습니다. 다른 프로젝트도 둘러보세요.`,
    });

    return { status: accept ? 'ACCEPTED' : 'REJECTED' };
  }
}
