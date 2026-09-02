import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findMine(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.notificationService.findMine(String(user?.id ?? ''), limit);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationService.markRead(String(user?.id ?? ''), id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notificationService.markAllRead(String(user?.id ?? ''));
  }
}
