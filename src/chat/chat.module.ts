import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatTranslationService } from './chat-translation.service';
import { ChatRepository } from './chat.repository';
import { ChatAuthService } from './chat-auth.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [
    ChatGateway,
    ChatTranslationService,
    ChatRepository,
    ChatAuthService,
  ],
})
export class ChatModule {}
