import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Language, PositionType } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getProjectDetail(projectId: string, lang: Language) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
          },
        },
        i18n: {
          where: { lang },
        },
        techStacks: {
          include: {
            techStack: true,
          },
        },
        positionNeeds: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const i18n = project.i18n[0] || null;
    const title = i18n?.title || project.titleOriginal;
    const summary = i18n?.summary || project.summaryOriginal;
    const description = i18n?.description || project.descriptionOriginal;

    const statusIdMap = {
      PLANNING: 1,
      IN_PROGRESS: 2,
      COMPLETED: 3,
      CANCELED: 4,
    };
    const statusId = statusIdMap[project.status] || 1;

    const techStacks = project.techStacks.map((pt) => ({
      id: pt.techStack.id,
      name: pt.techStack.name,
    }));

    const positionNeeds = project.positionNeeds.map((pp) => ({
      id: pp.id,
      position: pp.position,
    }));

    const membersCount = project.members.length;
    
    const membersCountMax = project.positionNeeds.reduce(
      (sum, pos) => sum + pos.headcount,
      0,
    );

    const currentMember = project.members.map((member) => ({
      id: member.user.id,
      nickname: member.user.nickname,
    }));

    const recommendUser = await this.calculateRecommendedUsers(
      projectId,
      project.techStacks.map((pt) => pt.techStackId),
      project.positionNeeds.map((pp) => pp.position),
    );

    return {
      project: {
        id: project.id,
        title,
        summary,
        description,
        statusId,
        status: project.status,
        deadline: project.deadline,
        startDate: project.startDate,
        endDate: project.endDate,
        ownerId: project.owner.id,
        ownerNickname: project.owner.nickname,
        profileImageUrl: project.owner.profileImageUrl,
      },
      techStacks,
      positionNeeds,
      membersCount,
      membersCountMax,
      currentMember,
      recommendUser,
    };
  }

  private async calculateRecommendedUsers(
    projectId: string,
    requiredTechStackIds: string[],
    requiredPositions: PositionType[],
  ) {
    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    const memberIds = projectMembers.map((m) => m.userId);

    const users = await this.prisma.user.findMany({
      where: {
        role: {
          in: requiredPositions, 
        },
        id: {
          notIn: memberIds, 
        },
      },
      include: {
        techStacks: {
          include: {
            techStack: true, 
          },
        },
      },
    });

    const recommendedUsers = users.map((user) => {
      const userTechStackIds = user.techStacks.map((ut) => ut.techStackId);
      const commonTechStacks = requiredTechStackIds.filter((techId) =>
        userTechStackIds.includes(techId),
      );
      
      const matchingPoint =
        requiredTechStackIds.length > 0
          ? Math.round(
              (commonTechStacks.length / requiredTechStackIds.length) * 100,
            ) : 0; 

      return {
        id: user.id,
        nickname: user.nickname,
        position: user.role,
        techStack: user.techStacks.map((ut) => ({
          id: ut.techStack.id,
          name: ut.techStack.name,
        })),
        matchingPoint,
      };
    });

    return recommendedUsers.sort((a, b) => b.matchingPoint - a.matchingPoint);
  }
}
