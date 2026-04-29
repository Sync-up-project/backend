import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateProjectDto } from './dto/generate-project.dto';
import { ReviseArtifactDto } from './dto/revise-artifact.dto';
import { ApproveArtifactDto } from './dto/approve-artifact.dto';
import { UpdateArtifactContentDto } from './dto/update-artifact-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('project/generate')
  async generate(@Body() dto: GenerateProjectDto) {
    return this.aiService.generateProject(dto);
  }

  @Post('project/generate-async')
  async generateAsync(@Body() dto: GenerateProjectDto) {
    return this.aiService.createGenerateJob(dto);
  }

  @Get('project/generate-status/:jobId')
  async getGenerateStatus(@Param('jobId') jobId: string) {
    return this.aiService.getGenerateJob(jobId);
  }

  @Get('artifacts/latest')
  async getLatestArtifact(@Query('projectId') projectId?: string) {
    return this.aiService.getLatestArtifact({ projectId });
  }

  @Get('artifacts')
  async listArtifacts(
    @Query('limit') limit?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.aiService.listArtifacts({
      limit: limit ? Number(limit) : 20,
      projectId,
    });
  }

  @Get('artifacts/:id')
  async getAritifact(@Param('id') id: string) {
    return this.aiService.getArtifactById(id);
  }

  @Get('artifacts/:id/revisions')
  async listRevisions(@Param('id') id: string) {
    return this.aiService.listArtifactRevisions(id);
  }

  @Post('artifacts/:id/revise')
  async reviseArtifact(
    @Param('id') id: string,
    @Body() dto: ReviseArtifactDto,
  ) {
    return this.aiService.reviseArtifact(id, dto);
  }

  @Patch('artifacts/:id/content')
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateArtifactContent(
    @Param('id') id: string,
    @Body() dto: UpdateArtifactContentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.aiService.updateArtifactContent(id, user.id, dto.contentJson);
  }

  @Post('artifacts/:id/approve')
  async approveArtifact(
    @Param('id') id: string,
    @Body() dto: ApproveArtifactDto,
  ) {
    return this.aiService.approveArtifact(id, dto);
  }
}
