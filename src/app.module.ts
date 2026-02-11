import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { ProjectModule } from './project/project.module';

@Module({
  imports: [ChatModule, ProjectModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

