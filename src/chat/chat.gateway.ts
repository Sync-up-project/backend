import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Language } from '@prisma/client';
import { ChatTranslationService } from './chat-translation.service';
import { ChatRepository } from './chat.repository';
import { ChatAuthService } from './chat-auth.service';
import { ProjectAccessService } from '../domain/project/project-access.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { ChatMessageDto, parseChatSourceLang } from '../domain/chat/chat.types';

type SocketData = {
  userId?: string;
};

type ConnectedUser = {
  userId: string;
  username: string;
  projectId: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly CHAT_PAGE_SIZE = 30;

  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, ConnectedUser>();
  private projectUsers = new Map<string, Set<string>>();

  constructor(
    private readonly chatRepo: ChatRepository,
    private readonly chatTranslation: ChatTranslationService,
    private readonly chatAuth: ChatAuthService,
    private readonly projectAccess: ProjectAccessService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ChatGateway.name);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ?? client.handshake.headers?.authorization;
      const raw =
        typeof token === 'string' && token.startsWith('Bearer ')
          ? token.slice(7)
          : token;
      const userId = await this.chatAuth.verifyAccessToken(raw);
      (client.data as SocketData).userId = userId;
      this.logger.log('Chat client connected', { socketId: client.id, userId });
    } catch {
      this.logger.warn('Chat client rejected: missing or invalid token', {
        socketId: client.id,
      });
      client.disconnect(true);
    }
  }

  private leaveCurrentRoom(client: Socket): void {
    const prev = this.connectedUsers.get(client.id);
    if (!prev) return;

    const roomName = `project:${prev.projectId}`;
    void client.leave(roomName);

    this.connectedUsers.delete(client.id);

    const projectUserSet = this.projectUsers.get(prev.projectId);
    if (projectUserSet) {
      projectUserSet.delete(client.id);
      if (projectUserSet.size === 0) {
        this.projectUsers.delete(prev.projectId);
      }
      const userCount = projectUserSet.size;
      this.server.to(roomName).emit('userCount', userCount);
      client.to(roomName).emit('userLeft', prev.username);
    }
  }

  handleDisconnect(client: Socket) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) return;

    const { username, projectId } = userInfo;
    this.connectedUsers.delete(client.id);

    const projectUserSet = this.projectUsers.get(projectId);
    if (projectUserSet) {
      projectUserSet.delete(client.id);
      if (projectUserSet.size === 0) {
        this.projectUsers.delete(projectId);
      }
    }

    const roomName = `project:${projectId}`;
    const userCount = this.projectUsers.get(projectId)?.size ?? 0;
    this.server.to(roomName).emit('userCount', userCount);
    client.to(roomName).emit('userLeft', username);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { projectId: string; userId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const authUserId = (client.data as SocketData).userId;
    if (!authUserId) {
      return { status: 'error', message: '인증이 필요합니다.' };
    }

    if (data.userId && data.userId !== authUserId) {
      return { status: 'error', message: '인증 정보와 사용자 ID가 일치하지 않습니다.' };
    }

    const { projectId } = data;
    if (!projectId) {
      return { status: 'error', message: 'projectId is required.' };
    }

    const isMember = await this.projectAccess.isMemberOrOwner(projectId, authUserId);
    if (!isMember) {
      return {
        status: 'error',
        message: '프로젝트 멤버만 채팅에 참여할 수 있습니다.',
      };
    }

    this.leaveCurrentRoom(client);

    const roomId = await this.chatRepo.ensureProjectRoom(projectId);
    if (!roomId) {
      return { status: 'error', message: '채팅방을 준비하지 못했습니다.' };
    }

    const nickname = await this.chatRepo.findUserNickname(authUserId);
    if (!nickname) {
      return { status: 'error', message: '사용자를 찾을 수 없습니다.' };
    }

    const roomName = `project:${projectId}`;
    await client.join(roomName);

    this.connectedUsers.set(client.id, {
      userId: authUserId,
      username: nickname,
      projectId,
    });

    if (!this.projectUsers.has(projectId)) {
      this.projectUsers.set(projectId, new Set());
    }
    this.projectUsers.get(projectId)!.add(client.id);

    const userCount = this.projectUsers.get(projectId)!.size;
    this.server.to(roomName).emit('userCount', userCount);
    client.to(roomName).emit('userJoined', nickname);

    const { messages, hasMore } = await this.chatRepo.loadLatestMessages(
      roomId,
      this.CHAT_PAGE_SIZE,
    );
    client.emit('messageHistory', { messages, hasMore });

    return { status: 'joined', roomId, username: nickname };
  }

  @SubscribeMessage('loadOlderMessages')
  async handleLoadOlderMessages(
    @MessageBody() data: { beforeCreatedAt: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) {
      return {
        status: 'error' as const,
        error: '채팅방에 먼저 입장해 주세요.',
      };
    }

    const before = new Date(data.beforeCreatedAt);
    if (Number.isNaN(before.getTime())) {
      return { status: 'error' as const, error: 'Invalid beforeCreatedAt.' };
    }

    const roomId = await this.chatRepo.ensureProjectRoom(userInfo.projectId);
    if (!roomId) {
      return { status: 'error' as const, error: '채팅방을 찾을 수 없습니다.' };
    }

    const { messages, hasMore } = await this.chatRepo.loadOlderMessages(
      roomId,
      before,
      this.CHAT_PAGE_SIZE,
    );

    return { status: 'ok' as const, messages, hasMore };
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody()
    data: { message: string; sourceLang?: Language | string },
    @ConnectedSocket() client: Socket,
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) {
      return {
        status: 'error',
        error: '채팅방에 먼저 입장해 주세요.',
      };
    }

    const text = String(data.message ?? '').trim();
    if (!text) {
      return { status: 'error', error: '메시지가 비어 있습니다.' };
    }
    if (text.length > 4000) {
      return { status: 'error', error: '메시지가 너무 깁니다.' };
    }

    const { userId, username, projectId } = userInfo;

    let originalLang = parseChatSourceLang(data.sourceLang);
    if (!originalLang) {
      originalLang = await this.chatRepo.findUserPrimaryLanguage(userId);
    }

    const roomId = await this.chatRepo.ensureProjectRoom(projectId);
    if (!roomId) {
      return { status: 'error', error: '채팅방을 찾을 수 없습니다.' };
    }

    const translated = await this.chatTranslation.translateMessage(
      text,
      originalLang,
    );

    const chatMessage = await this.chatRepo.createMessage({
      roomId,
      senderId: userId,
      text,
      originalLang,
      translations: translated,
    });

    if (!chatMessage) {
      return { status: 'error', error: '메시지 저장에 실패했습니다.' };
    }

    const payload: ChatMessageDto = {
      ...chatMessage,
      username,
    };

    const roomName = `project:${projectId}`;
    this.server.to(roomName).emit('message', payload);

    return { status: 'sent', message: payload };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) return;

    const { username, projectId } = userInfo;
    const roomName = `project:${projectId}`;
    client.to(roomName).emit('typing', {
      username,
      isTyping: Boolean(data.isTyping),
    });
  }
}
