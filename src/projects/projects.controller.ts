import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Language } from '@prisma/client';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(':id')
  async getProjectDetail(
    @Param('id') id: string,
    @Query('lang') lang?: string,
  ) {
    const language =
      lang && Object.values(Language).includes(lang as Language)
        ? (lang as Language)
        : Language.KO;

    return this.projectsService.getProjectDetail(id, language);
  }
}
