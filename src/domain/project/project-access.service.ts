import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { HttpStatus } from '@nestjs/common';

export type ProjectAccessContext = {
  id: string;
  ownerId: string;
};

/**
 * 프로젝트 접근 권한 도메인 서비스.
 * 캘린더·채팅·칸반 등 여러 모듈에서 동일 규칙을 재사용합니다.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMemberOrOwner(
    projectId: string,
    userId: string,
  ): Promise<ProjectAccessContext> {
    if (!userId) {
      throw new AppException({
        code: ErrorCode.UNAUTHORIZED,
        message: '로그인이 필요합니다.',
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true },
    });

    if (!project) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: '프로젝트를 찾을 수 없습니다.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (project.ownerId === userId) {
      return project;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true },
    });

    if (!member) {
      throw new AppException({
        code: ErrorCode.FORBIDDEN,
        message: '프로젝트 멤버만 접근할 수 있습니다.',
        status: HttpStatus.FORBIDDEN,
      });
    }

    return project;
  }

  async isMemberOrOwner(projectId: string, userId: string): Promise<boolean> {
    try {
      await this.assertMemberOrOwner(projectId, userId);
      return true;
    } catch {
      return false;
    }
  }
}
