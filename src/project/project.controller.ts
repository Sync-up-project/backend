import { Controller, Get, Query } from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  /**
   * 프로젝트 목록 조회
   * GET /projects/list
   * 
   * @param userId - 현재 사용자 ID (선택사항, 좋아요 여부 확인용)
   * @returns 프로젝트 목록
   */
  @Get('list')
  async getProjectList(@Query('userId') userId?: string) {
    const projects = await this.projectService.getProjectList(userId);
    
    return {
      project: projects,
    };
  }
}
