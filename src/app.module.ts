import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { ProjectModule } from './project/project.module';
import { AiModule } from './ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KanbanModule } from './kanban/kanban.module';

@Module({
  imports: [ChatModule, ProjectModule, AiModule, PrismaModule, KanbanModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

