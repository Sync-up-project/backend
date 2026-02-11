import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  /**
   * 프로젝트 목록 조회
   * 
   * @param userId - 현재 사용자 ID (선택사항, 좋아요 여부 확인용)
   * @returns 프로젝트 목록
   */
  async getProjectList(userId?: string) {
    const projects = await this.prisma.project.findMany({
      include: {
        owner: {
          select: {
            id: true,
            nickname: true,
          },
        },
        techStacks: {
          include: {
            techStack: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        positionNeeds: {
          select: {
            id: true,
            position: true,
          },
        },
        members: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return projects.map((project) => {
      // 멤버 수 계산 (소유자 포함)
      const membersCount = project.members.length + 1; // +1은 소유자
      const membersCountMax = project.capacity;

      // techStacks 변환
      const techStacks = project.techStacks.map((pt) => ({
        id: pt.techStack.id,
        name: pt.techStack.name,
      }));

      // positionNeeds 변환
      const positionNeeds = project.positionNeeds.map((pn) => ({
        id: pn.id,
        position: pn.position,
      }));

      // LIKE 여부 (현재는 스키마에 사용자별 좋아요 모델이 없으므로 false로 반환)
      // TODO: 좋아요 기능이 추가되면 수정 필요
      const LIKE = 'false';

      return {
        id: project.id,
        title: project.titleOriginal,
        summary: project.summaryOriginal,
        ownerid: project.ownerId,
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
}
