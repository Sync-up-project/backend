import { Module } from '@nestjs/common';
import { KanbanController } from '../kanban/kanban.controller';
import { KanbanService } from '../kanban/kanban.service';
@Module({
  controllers: [KanbanController],
  providers: [KanbanService],
})
export class KanbanModule {}
