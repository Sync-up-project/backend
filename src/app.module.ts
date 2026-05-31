import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { ProjectDomainModule } from './domain/project/project-domain.module';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { ProjectModule } from './project/project.module';
import { AiModule } from './ai/ai.module';
import { KanbanModule } from './kanban/kanban.module';
import { NoticeModule } from './notice/notice.module';
import { CommunityModule } from './community/community.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    ProjectDomainModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ChatModule,
    ProjectModule,
    AiModule,
    KanbanModule,
    NoticeModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*');
  }
}
