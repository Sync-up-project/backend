import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  async overview(@Req() req: Request) {
    await this.adminService.writeAudit(
      String((req.user as any)?.id ?? ''),
      'Viewed admin overview',
    );
    return this.adminService.getOverview();
  }

  @Get('users')
  async users(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listUsers({ q, limit, offset });
  }

  @Get('projects')
  async projects(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listProjects({ q, limit, offset });
  }

  @Get('community-posts')
  async communityPosts(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listCommunityPosts({ q, limit, offset });
  }

  @Get('notices')
  async notices(@Query('q') q?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listNotices({ q, limit, offset });
  }

  @Get('audit-logs')
  async auditLogs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminService.listAuditLogs({ limit, offset });
  }
}
