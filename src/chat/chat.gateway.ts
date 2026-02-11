/**
 * 웹소켓 게이트웨이란?
 * 
 * 웹소켓 게이트웨이는 클라이언트와 서버 간의 양방향 실시간 통신을 담당하는 컴포넌트입니다.
 * 
 * 전통적인 HTTP 요청-응답 방식과 달리:
 * - HTTP: 클라이언트가 요청하면 서버가 응답하는 단방향 통신
 * - WebSocket: 클라이언트와 서버가 서로 언제든지 메시지를 주고받을 수 있는 양방향 통신
 * 
 * 주요 특징:
 * 1. 실시간성: 서버가 클라이언트에게 즉시 데이터를 푸시할 수 있음
 * 2. 지속 연결: 한 번 연결되면 계속 유지되어 오버헤드가 적음
 * 3. 이벤트 기반: 특정 이벤트를 구독하고 발생 시 처리
 * 
 * 사용 사례:
 * - 실시간 채팅
 * - 주식 가격 업데이트
 * - 알림 시스템
 * - 온라인 게임
 * - 협업 도구 (구글 독스 등)
 */

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

/**
 * 채팅 메시지 인터페이스
 * 클라이언트와 서버 간에 주고받는 메시지의 구조를 정의합니다.
 */
interface ChatMessage {
  id: string;              // 메시지 고유 ID
  username: string;        // 발신자 사용자명
  message: string;         // 메시지 내용
  timestamp: Date;         // 메시지 전송 시간
}

/**
 * ChatGateway 클래스
 * 
 * @WebSocketGateway 데코레이터:
 * - 이 클래스를 웹소켓 게이트웨이로 등록합니다
 * - namespace: '/chat' - 클라이언트는 ws://host/chat 으로 연결합니다
 * - cors: Cross-Origin Resource Sharing 설정으로 프론트엔드에서 접근 가능하도록 합니다
 * 
 * @implements OnGatewayConnection, OnGatewayDisconnect
 * - OnGatewayConnection: 클라이언트가 연결될 때 실행되는 메서드를 정의
 * - OnGatewayDisconnect: 클라이언트가 연결을 끊을 때 실행되는 메서드를 정의
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  /**
   * @WebSocketServer() 데코레이터
   * Socket.IO 서버 인스턴스를 주입받습니다.
   * 이 서버를 통해 모든 연결된 클라이언트에게 메시지를 브로드캐스트할 수 있습니다.
   */
  @WebSocketServer()
  server: Server;

  /**
   * 연결된 사용자 관리
   * Map<socketId, { userId: string, username: string, projectId: string }> 형태로 현재 접속 중인 사용자들을 추적합니다.
   * socketId는 Socket.IO가 각 연결에 부여하는 고유 식별자입니다.
   */
  private connectedUsers = new Map<string, { userId: string; username: string; projectId: string }>();

  /**
   * 프로젝트별 접속자 수 관리
   * Map<projectId, Set<socketId>> 형태로 각 프로젝트 채팅방의 접속자를 추적합니다.
   */
  private projectUsers = new Map<string, Set<string>>();

  /**
   * 생성자
   * PrismaService를 의존성 주입받아 데이터베이스 작업을 수행합니다.
   */
  constructor(private prisma: PrismaService) {}

  /**
   * 클라이언트 연결 처리
   * 
   * 클라이언트가 웹소켓으로 서버에 연결되면 자동으로 호출됩니다.
   * 
   * @param client - 연결된 클라이언트의 Socket 객체
   *                 각 클라이언트마다 고유한 socketId를 가지고 있습니다.
   * 
   * 처리 과정:
   * 1. 연결 로그만 출력 (실제 채팅방 입장은 join 이벤트에서 처리)
   */
  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  /**
   * 프로젝트 채팅방 생성 또는 조회
   * 
   * 프로젝트에 대한 채팅방을 생성하거나 기존 것을 찾습니다.
   * 프로젝트당 하나의 채팅방만 존재합니다.
   * 
   * @param projectId - 프로젝트 ID
   * @returns Promise<string | null> - 채팅방 ID, 실패 시 null
   */
  private async ensureProjectRoom(projectId: string): Promise<string | null> {
    try {
      // 기존 프로젝트 채팅방이 있는지 확인
      let room = await this.prisma.chatRoom.findUnique({
        where: { projectId },
      });

      // 없으면 새로 생성
      if (!room) {
        room = await this.prisma.chatRoom.create({
          data: {
            type: 'PROJECT_GROUP',
            projectId,
          },
        });
      }

      return room.id;
    } catch (error) {
      console.error('Failed to ensure project room:', error);
      return null;
    }
  }

  /**
   * 사용자가 프로젝트 멤버인지 확인
   * 
   * @param userId - 사용자 ID
   * @param projectId - 프로젝트 ID
   * @returns Promise<boolean> - 프로젝트 멤버 여부
   */
  private async isProjectMember(userId: string, projectId: string): Promise<boolean> {
    try {
      const member = await this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      // 프로젝트 소유자도 멤버로 간주
      if (member) return true;

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      });

      return project?.ownerId === userId;
    } catch (error) {
      console.error('Failed to check project membership:', error);
      return false;
    }
  }

  /**
   * 데이터베이스에서 메시지 히스토리 로드
   * 
   * 프로젝트 채팅방의 최근 100개 메시지를 DB에서 가져와서
   * 클라이언트가 연결될 때 전송할 수 있도록 포맷팅합니다.
   * 
   * @param roomId - 채팅방 ID
   * @returns Promise<ChatMessage[]> - 포맷팅된 메시지 배열
   */
  private async loadMessagesFromDB(roomId: string): Promise<ChatMessage[]> {
    try {
      // Prisma를 사용하여 DB에서 메시지 조회
      const dbMessages = await this.prisma.chatMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: 'asc' },         // 시간순 정렬
        take: 100,                              // 최근 100개만
        include: {
          sender: {
            select: {
              nickname: true,                   // 발신자의 닉네임만 가져오기
            },
          },
        },
      });

      // DB 형식을 클라이언트가 기대하는 형식으로 변환
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

  /**
   * 클라이언트 연결 해제 처리
   * 
   * 클라이언트가 웹소켓 연결을 끊으면 자동으로 호출됩니다.
   * 
   * @param client - 연결이 끊긴 클라이언트의 Socket 객체
   * 
   * 처리 과정:
   * 1. 연결된 사용자 목록에서 제거
   * 2. 프로젝트별 접속자 목록에서 제거
   * 3. 해당 프로젝트 채팅방의 다른 사용자들에게 접속자 수 업데이트
   * 4. 사용자 퇴장 알림 브로드캐스트
   */
  handleDisconnect(client: Socket) {
    // 연결 해제된 클라이언트의 정보 조회
    const userInfo = this.connectedUsers.get(client.id);
    if (userInfo) {
      const { username, projectId } = userInfo;
      
      // 사용자 목록에서 제거
      this.connectedUsers.delete(client.id);
      
      // 프로젝트별 접속자 목록에서 제거
      const projectUserSet = this.projectUsers.get(projectId);
      if (projectUserSet) {
        projectUserSet.delete(client.id);
        if (projectUserSet.size === 0) {
          this.projectUsers.delete(projectId);
        }
      }
      
      console.log(`User disconnected: ${username} (${client.id}) from project ${projectId}`);
      
      // 해당 프로젝트 채팅방의 다른 사용자들에게만 접속자 수 업데이트
      const roomName = `project:${projectId}`;
      const userCount = projectUserSet?.size || 0;
      client.to(roomName).emit('userCount', userCount);
      
      // 사용자 퇴장 알림 브로드캐스트 (해당 프로젝트 채팅방에만)
      client.to(roomName).emit('userLeft', username);
    } else {
      // join 이벤트를 보내지 않은 클라이언트의 경우
      console.log(`Client disconnected: ${client.id}`);
    }
  }

  /**
   * 사용자 입장 처리
   * 
   * @SubscribeMessage('join') 데코레이터:
   * - 클라이언트가 'join' 이벤트를 보내면 이 메서드가 실행됩니다
   * - 클라이언트: socket.emit('join', { userId: 'user-id', projectId: 'project-id' })
   * 
   * @param data - 클라이언트가 전송한 데이터
   *   - userId: 사용자 ID (필수)
   *   - projectId: 프로젝트 ID (필수)
   * @param client - 이벤트를 보낸 클라이언트의 Socket 객체
   * 
   * @returns { status: 'joined' | 'error', message?: string, roomId?: string } - 입장 성공/실패 응답
   * 
   * 처리 과정:
   * 1. 프로젝트 멤버 권한 확인
   * 2. 프로젝트 채팅방 생성 또는 조회
   * 3. Socket.IO room에 참여
   * 4. 클라이언트의 socketId와 사용자 정보를 매핑하여 저장
   * 5. 프로젝트 채팅방의 다른 사용자들에게 접속자 수 업데이트
   * 6. 사용자 입장 알림 브로드캐스트
   * 7. 메시지 히스토리 전송
   */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { userId: string; projectId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, projectId } = data;

    // 프로젝트 멤버 권한 확인
    const isMember = await this.isProjectMember(userId, projectId);
    if (!isMember) {
      return { 
        status: 'error', 
        message: 'You are not a member of this project. Only project members can join the chat.' 
      };
    }

    // 프로젝트 채팅방 생성 또는 조회
    const roomId = await this.ensureProjectRoom(projectId);
    if (!roomId) {
      return { 
        status: 'error', 
        message: 'Failed to create or find project chat room.' 
      };
    }

    // 사용자 정보 조회
    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });
    } catch (error) {
      console.error('Failed to find user:', error);
      return { status: 'error', message: 'Failed to find user.' };
    }

    if (!user) {
      return { status: 'error', message: 'User not found.' };
    }

    const username = user.nickname;

    // Socket.IO room에 참여 (프로젝트별로 분리)
    const roomName = `project:${projectId}`;
    await client.join(roomName);

    // 사용자 정보 저장
    this.connectedUsers.set(client.id, { userId, username, projectId });

    // 프로젝트별 접속자 목록에 추가
    if (!this.projectUsers.has(projectId)) {
      this.projectUsers.set(projectId, new Set());
    }
    this.projectUsers.get(projectId)!.add(client.id);

    console.log(`User joined: ${username} (${client.id}) to project ${projectId}`);

    // 해당 프로젝트 채팅방의 모든 사용자에게 접속자 수 업데이트
    const userCount = this.projectUsers.get(projectId)!.size;
    this.server.to(roomName).emit('userCount', userCount);

    // 사용자 입장 알림 브로드캐스트 (해당 프로젝트 채팅방에만)
    client.to(roomName).emit('userJoined', username);

    // 메시지 히스토리 로드 및 전송
    const messageHistory = await this.loadMessagesFromDB(roomId);
    client.emit('messageHistory', messageHistory);

    return { status: 'joined', roomId, username };
  }

  /**
   * 메시지 전송 처리
   * 
   * @SubscribeMessage('message') 데코레이터:
   * - 클라이언트가 'message' 이벤트를 보내면 이 메서드가 실행됩니다
   * - 클라이언트: socket.emit('message', { message: '메시지 내용' })
   * 
   * @param data - 클라이언트가 전송한 메시지 데이터
   *   - message: 메시지 내용 (필수)
   * @param client - 이벤트를 보낸 클라이언트의 Socket 객체
   * 
   * @returns { status: 'sent' | 'error', message?: ChatMessage, error?: string }
   * 
   * 처리 과정:
   * 1. 클라이언트의 프로젝트 정보 확인 (join 이벤트로 저장된 정보 사용)
   * 2. 프로젝트 채팅방 확인 및 생성
   * 3. DB에 메시지 저장
   * 4. 해당 프로젝트 채팅방의 모든 클라이언트에게 메시지 브로드캐스트
   */
  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { message: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { message } = data;

    // 클라이언트의 프로젝트 정보 확인
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) {
      return { 
        status: 'error', 
        error: 'You must join a project chat room first. Please send a join event.' 
      };
    }

    const { userId, username, projectId } = userInfo;

    // 프로젝트 채팅방 확인 및 생성
    const roomId = await this.ensureProjectRoom(projectId);
    if (!roomId) {
      return { 
        status: 'error', 
        error: 'Failed to create or find project chat room.' 
      };
    }

    // DB에 메시지 저장 시도
    try {
      // Prisma를 사용하여 ChatMessage 생성
      const dbMessage = await this.prisma.chatMessage.create({
        data: {
          roomId,
          senderId: userId,
          originalText: message,
          originalLang: Language.KO, // 기본 언어는 한국어
        },
        include: {
          sender: {
            select: {
              nickname: true,
            },
          },
        },
      });

      // DB 메시지를 클라이언트 형식으로 변환
      const chatMessage: ChatMessage = {
        id: dbMessage.id,
        username: dbMessage.sender.nickname,
        message: dbMessage.originalText,
        timestamp: dbMessage.createdAt,
      };

      // 해당 프로젝트 채팅방의 모든 클라이언트에게 메시지 브로드캐스트
      const roomName = `project:${projectId}`;
      this.server.to(roomName).emit('message', chatMessage);
      
      return { status: 'sent', message: chatMessage };
    } catch (error) {
      console.error('Failed to save message to DB:', error);
      return { 
        status: 'error', 
        error: 'Failed to save message to database.' 
      };
    }
  }

  /**
   * 타이핑 상태 전송 처리
   * 
   * @SubscribeMessage('typing') 데코레이터:
   * - 클라이언트가 'typing' 이벤트를 보내면 이 메서드가 실행됩니다
   * - 클라이언트: socket.emit('typing', { isTyping: true/false })
   * 
   * @param data - 타이핑 상태 데이터
   *   - isTyping: 타이핑 중인지 여부 (true: 타이핑 시작, false: 타이핑 종료)
   * @param client - 이벤트를 보낸 클라이언트의 Socket 객체
   * 
   * client.to(room).emit():
   * - 특정 room의 다른 클라이언트들에게만 메시지를 보냅니다
   * - 자신이 타이핑 중인 것을 자신에게 알릴 필요는 없으므로 broadcast 사용
   */
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const { isTyping } = data;
    
    // 클라이언트의 프로젝트 정보 확인
    const userInfo = this.connectedUsers.get(client.id);
    if (!userInfo) {
      return;
    }

    const { username, projectId } = userInfo;
    const roomName = `project:${projectId}`;
    
    // 해당 프로젝트 채팅방의 다른 클라이언트들에게만 타이핑 상태 브로드캐스트
    // 예: "홍길동님이 입력 중..." 같은 UI 표시에 사용됩니다
    client.to(roomName).emit('typing', { username, isTyping });
  }
}
