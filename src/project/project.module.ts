import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { InvitationsController } from './invitations.controller';
import { ApplicationsController } from './applications.controller';
import { CalendarEventsController } from './calendar-events.controller';
import { ProjectService } from './project.service';
import { ProjectParticipationService } from './project-participation.service';
import { CalendarEventsService } from './calendar-events.service';
@Module({
  controllers: [ProjectController, InvitationsController, ApplicationsController, CalendarEventsController],
  providers: [ProjectService, ProjectParticipationService, CalendarEventsService],
})
export class ProjectModule {}
