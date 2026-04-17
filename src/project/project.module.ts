import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { InvitationsController } from './invitations.controller';
import { ApplicationsController } from './applications.controller';
import { ProjectService } from './project.service';
import { ProjectParticipationService } from './project-participation.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ProjectController, InvitationsController, ApplicationsController],
  providers: [ProjectService, ProjectParticipationService, PrismaService],
})
export class ProjectModule {}
