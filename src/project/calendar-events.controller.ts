import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarEventsService } from './calendar-events.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';

@Controller('projects')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class CalendarEventsController {
  constructor(private readonly calendarEvents: CalendarEventsService) {}

  @Get(':id/calendar-events/summary')
  @UseGuards(JwtAuthGuard)
  async summary(@Param('id') projectId: string, @CurrentUser() user: any) {
    return this.calendarEvents.summary(projectId, String(user?.id ?? ''));
  }

  @Get(':id/calendar-events')
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Param('id') projectId: string,
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('includeDone') includeDone?: string,
    @Query('sort') sort?: string,
    @Query('q') q?: string,
  ) {
    return this.calendarEvents.findAll(projectId, String(user?.id ?? ''), {
      from,
      to,
      type,
      status,
      priority,
      assigneeId,
      includeDone,
      sort,
      q,
    });
  }

  @Post(':id/calendar-events')
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('id') projectId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.calendarEvents.create(projectId, String(user?.id ?? ''), dto);
  }

  @Patch(':id/calendar-events/:eventId')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') projectId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarEvents.update(projectId, eventId, String(user?.id ?? ''), dto);
  }

  @Delete(':id/calendar-events/:eventId')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') projectId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.calendarEvents.remove(projectId, eventId, String(user?.id ?? ''));
  }
}
