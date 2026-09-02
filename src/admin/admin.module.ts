import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, PrismaService],
})
export class AdminModule {}
