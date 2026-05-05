import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatTranslationService } from './chat-translation.service';

@Module({
  providers: [ChatGateway, ChatTranslationService],
})
export class ChatModule {}
