import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ConfirmProjectDto } from './dto/confirm-project.dto';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  /**
   * 프로젝트 확정(artifact 기반 생성)
   * POST /projects/confirm
   */
  @Post('confirm')
  async confirm(@Body() dto: ConfirmProjectDto) {
    return this.projectService.confirmFromArtifact(dto);
  }

  /**
   * 프로젝트 목록 조회(기본)
   * GET /projects?limit=20
   */
  @Get()
  async list(@Query('limit') limit?: string) {
    return this.projectService.listProjects({
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * 프로젝트 목록 조회(기존 /projects/list 유지 버전)
   * GET /projects/list?userId=xxx
   *
   * @param userId - 현재 사용자 ID (선택사항, 좋아요 여부 확인용)
   */
  @Get('list')
  async getProjectList(@Query('userId') userId?: string) {
    const projects = await this.projectService.getProjectList(userId);

    return {
      project: projects,
    };
  }

  /**
   * 프로젝트 상세 조회
   * GET /projects/:id
   */
  @Get(':id')
  async getProject(@Param('id') id: string) {
    return this.projectService.getProjectById(id);
  }

  /**
   * 프로젝트 칸반 조회
   * GET /projects/:id/kanban
   */
  @Get(':id/kanban')
  async getKanbanBoard(@Param('id') id: string) {
    return this.projectService.getKanbanBoard(id);
  }
}