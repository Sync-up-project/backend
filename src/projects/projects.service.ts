import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Language, PositionType } from '@prisma/client';

/**
 * 프로젝트 관련 비즈니스 로직을 처리하는 서비스
 */
@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 프로젝트 상세 정보를 조회합니다.
   * 
   * @param projectId - 조회할 프로젝트 ID
   * @param lang - 언어 코드 (KO, EN, JA)
   * @returns 프로젝트 상세 정보, 기술 스택, 포지션 요구사항, 멤버 정보, 추천 유저 등
   */
  async getProjectDetail(projectId: string, lang: Language) {
    // Prisma를 사용하여 프로젝트 정보 조회
    // include를 사용하여 관련 데이터(owner, i18n, techStacks, positionNeeds, members)를 함께 가져옴
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        // 프로젝트 소유자 정보 (id, nickname, profileImageUrl만 선택)
        owner: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
          },
        },
        // 다국어 번역 데이터 (요청한 언어에 해당하는 것만 필터링)
        i18n: {
          where: { lang },
        },
        // 프로젝트에 사용되는 기술 스택 목록 (techStack 관계 포함)
        techStacks: {
          include: {
            techStack: true,
          },
        },
        // 프로젝트에 필요한 포지션 목록
        positionNeeds: true,
        // 프로젝트 멤버 목록 (user 정보 포함)
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

    // 프로젝트가 존재하지 않으면 404 에러 발생
    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // 다국어 번역 데이터 처리
    // i18n 데이터가 있으면 번역된 제목/요약/설명 사용, 없으면 원본 사용
    const i18n = project.i18n[0] || null;
    const title = i18n?.title || project.titleOriginal;
    const summary = i18n?.summary || project.summaryOriginal;
    const description = i18n?.description || project.descriptionOriginal;

    // 프로젝트 상태를 숫자 ID로 변환
    // enum 값(PLANNING, IN_PROGRESS 등)을 숫자로 매핑
    const statusIdMap = {
      PLANNING: 1,
      IN_PROGRESS: 2,
      COMPLETED: 3,
      CANCELED: 4,
    };
    const statusId = statusIdMap[project.status] || 1;

    // 기술 스택 배열 변환
    // ProjectTechStack 관계에서 실제 TechStack 정보만 추출
    const techStacks = project.techStacks.map((pt) => ({
      id: pt.techStack.id,
      name: pt.techStack.name,
    }));

    // 포지션 요구사항 배열 변환
    // 필요한 포지션 정보만 추출
    const positionNeeds = project.positionNeeds.map((pp) => ({
      id: pp.id,
      position: pp.position,
    }));

    // 현재 멤버 수 계산
    const membersCount = project.members.length;
    
    // 최대 멤버 수 계산
    // positionNeeds의 각 포지션별 headcount(인원 수)를 모두 합산
    const membersCountMax = project.positionNeeds.reduce(
      (sum, pos) => sum + pos.headcount,
      0,
    );

    // 현재 멤버 목록 변환
    // ProjectMember 관계에서 User 정보만 추출
    const currentMember = project.members.map((member) => ({
      id: member.user.id,
      nickname: member.user.nickname,
    }));

    // 추천 유저 계산
    // 프로젝트의 기술 스택과 포지션 요구사항을 기반으로 매칭 점수를 계산
    const recommendUser = await this.calculateRecommendedUsers(
      projectId,
      project.techStacks.map((pt) => pt.techStackId),
      project.positionNeeds.map((pp) => pp.position),
    );

    // 최종 응답 객체 구성
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

  /**
   * 프로젝트에 추천할 유저를 계산합니다.
   * 프로젝트의 기술 스택과 포지션 요구사항을 기반으로 매칭 점수를 계산합니다.
   * 
   * @param projectId - 프로젝트 ID (이미 참여한 멤버 제외용)
   * @param requiredTechStackIds - 프로젝트에 필요한 기술 스택 ID 배열
   * @param requiredPositions - 프로젝트에 필요한 포지션 배열
   * @returns 매칭 점수 순으로 정렬된 추천 유저 배열
   */
  private async calculateRecommendedUsers(
    projectId: string,
    requiredTechStackIds: string[],
    requiredPositions: PositionType[],
  ) {
    // 프로젝트에 이미 참여한 멤버 ID 목록 조회
    // 추천 목록에서 제외하기 위함
    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    const memberIds = projectMembers.map((m) => m.userId);

    // 필요한 포지션에 맞는 유저 조회
    // 조건:
    // 1. role이 requiredPositions 중 하나와 일치
    // 2. 이미 프로젝트에 참여한 멤버는 제외 (notIn 사용)
    // 3. 유저의 기술 스택 정보도 함께 가져옴
    const users = await this.prisma.user.findMany({
      where: {
        role: {
          in: requiredPositions, // 포지션이 필요한 포지션 중 하나인지 확인
        },
        id: {
          notIn: memberIds, // 이미 프로젝트에 참여한 멤버 제외
        },
      },
      include: {
        techStacks: {
          include: {
            techStack: true, // 기술 스택 상세 정보 포함
          },
        },
      },
    });

    // 각 유저에 대해 매칭 점수 계산
    const recommendedUsers = users.map((user) => {
      // 유저가 보유한 기술 스택 ID 목록 추출
      const userTechStackIds = user.techStacks.map((ut) => ut.techStackId);
      
      // 프로젝트가 요구하는 기술 스택과 유저가 보유한 기술 스택의 교집합 계산
      // 공통 기술 스택이 많을수록 매칭 점수가 높아짐
      const commonTechStacks = requiredTechStackIds.filter((techId) =>
        userTechStackIds.includes(techId),
      );
      
      // 매칭 점수 계산
      // 공통 기술 스택 수 / 요구 기술 스택 수 * 100
      // 예: 3개 중 2개 일치 = 66점
      const matchingPoint =
        requiredTechStackIds.length > 0
          ? Math.round(
              (commonTechStacks.length / requiredTechStackIds.length) * 100,
            )
          : 0; // 요구 기술 스택이 없으면 0점

      // 추천 유저 정보 반환
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

    // 매칭 점수가 높은 순으로 정렬 (내림차순)
    return recommendedUsers.sort((a, b) => b.matchingPoint - a.matchingPoint);
  }
}
