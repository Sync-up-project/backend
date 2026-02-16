import { Module } from '@nestjs/common';
import { KanbanController } from '../kanban/kanban.controller';
import { KanbanService } from '../kanban/kanban.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [KanbanController],
  providers: [KanbanService, PrismaService],
})
export class KanbanModule {}
