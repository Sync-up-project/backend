import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

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
    // ✅ .env 전역 사용
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // ✅ DB
    PrismaModule,

    // ✅ 인증/회원
    AuthModule,
    UsersModule,

    // ✅ 기존 기능 모듈들
    ChatModule,
    ProjectModule,
    AiModule,
    KanbanModule,

    // ✅ 공지사항/커뮤니티
    NoticeModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
