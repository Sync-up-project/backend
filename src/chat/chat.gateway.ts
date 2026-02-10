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
import { PrismaService } from '../prisma/prisma.service';
import { Language } from '@prisma/client';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>();
  private messages: ChatMessage[] = [];
  private globalRoomId: string | null = null;

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    
    if (!this.globalRoomId) {
      await this.ensureGlobalRoom();
    }
    
    if (this.globalRoomId) {
      const dbMessages = await this.loadMessagesFromDB();
      client.emit('messageHistory', dbMessages);
    } else {
      client.emit('messageHistory', this.messages);
    }
    
    this.server.emit('userCount', this.connectedUsers.size);
  }

  private async ensureGlobalRoom() {
    try {
      let room = await this.prisma.chatRoom.findFirst({
        where: { type: 'PROJECT_GROUP', projectId: null },
      });

      if (!room) {
        room = await this.prisma.chatRoom.create({
          data: {
            type: 'PROJECT_GROUP',
            projectId: null,
          },
        });
      }

      this.globalRoomId = room.id;
    } catch (error) {
      console.error('Failed to ensure global room:', error);
    }
  }

  private async loadMessagesFromDB() {
    if (!this.globalRoomId) return [];

    try {
      const dbMessages = await this.prisma.chatMessage.findMany({
        where: { roomId: this.globalRoomId },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: {
          sender: {
            select: {
              nickname: true,
            },
          },
        },
      });

      return dbMessages.map((msg) => ({
        id: msg.id,
        username: msg.sender.nickname,
        message: msg.originalText,
        timestamp: msg.createdAt,
      }));
    } catch (error) {
      console.error('Failed to load messages from DB:', error);
      return [];
    }
  }

  handleDisconnect(client: Socket) {
    const username = this.connectedUsers.get(client.id);
    if (username) {
      this.connectedUsers.delete(client.id);
      console.log(`User disconnected: ${username} (${client.id})`);
      this.server.emit('userCount', this.connectedUsers.size);
      this.server.emit('userLeft', username);
    } else {
      console.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { username: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { username } = data;
    this.connectedUsers.set(client.id, username);
    console.log(`User joined: ${username} (${client.id})`);
    
    this.server.emit('userCount', this.connectedUsers.size);
    this.server.emit('userJoined', username);
    
    return { status: 'joined', username };
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { username: string; message: string; userId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { username, message, userId } = data;
    
    if (!this.globalRoomId) {
      await this.ensureGlobalRoom();
    }

    let senderId = userId;
    
    if (!senderId) {
      try {
        const user = await this.prisma.user.findFirst({
          where: { nickname: username },
        });
        
        if (!user) {
          return { status: 'error', message: 'User not found. Please provide userId.' };
        }
        
        senderId = user.id;
      } catch (error) {
        console.error('Failed to find user:', error);
        return { status: 'error', message: 'Failed to find user' };
      }
    }

    try {
      const dbMessage = await this.prisma.chatMessage.create({
        data: {
          roomId: this.globalRoomId!,
          senderId: senderId,
          originalText: message,
          originalLang: Language.KO,
        },
        include: {
          sender: {
            select: {
              nickname: true,
            },
          },
        },
      });

      const chatMessage: ChatMessage = {
        id: dbMessage.id,
        username: dbMessage.sender.nickname,
        message: dbMessage.originalText,
        timestamp: dbMessage.createdAt,
      };

      this.messages.push(chatMessage);
      if (this.messages.length > 100) {
        this.messages.shift();
      }

      this.server.emit('message', chatMessage);
      
      return { status: 'sent', message: chatMessage };
    } catch (error) {
      console.error('Failed to save message to DB:', error);
      
      const chatMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random()}`,
        username,
        message,
        timestamp: new Date(),
      };

      this.messages.push(chatMessage);
      if (this.messages.length > 100) {
        this.messages.shift();
      }

      this.server.emit('message', chatMessage);
      
      return { status: 'sent', message: chatMessage };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { username: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const { username, isTyping } = data;
    client.broadcast.emit('typing', { username, isTyping });
  }
}
