import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectParticipationService } from './project-participation.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly participation: ProjectParticipationService) {}

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async respond(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { decision?: string },
  ) {
    const accept = String(body?.decision ?? '').toUpperCase() === 'ACCEPT';
    const reject = String(body?.decision ?? '').toUpperCase() === 'REJECT';
    if (!accept && !reject) {
      throw new BadRequestException('decision은 ACCEPT 또는 REJECT 이어야 합니다.');
    }
    return this.participation.respondToApplication(id, String(user?.id ?? ''), accept);
  }
}
