import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO Redis 어댑터 (서버 여러 대 운영용)
 *
 * 기본 어댑터는 "이 프로세스에 연결된 소켓"에게만 메시지를 보냅니다.
 * ALB 뒤에 backend 가 2대 이상이면 같은 채팅방 사용자가 서로 다른 서버에 붙을 수 있어서,
 * A 서버에서 보낸 메시지가 B 서버 사용자에게 가지 않습니다.
 *
 * Redis 어댑터는 room 브로드캐스트를 Redis pub/sub 으로 모든 서버에 전달하고,
 * fetchSockets() 같은 조회도 모든 서버에 물어서 합칩니다.
 *
 * REDIS_URL 이 있을 때만 main.ts 에서 사용합니다. (없으면 서버 1대용 기본 어댑터)
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: ReturnType<typeof createClient>[] = [];

  async connectToRedis(url: string): Promise<void> {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();

    // 'error' 리스너가 없으면 연결이 잠깐 끊겼을 때 프로세스가 죽습니다. (재연결은 클라이언트가 자동으로 함)
    for (const client of [pubClient, subClient]) {
      client.on('error', (err: Error) =>
        this.logger.error(`Redis 연결 오류: ${err.message}`),
      );
    }

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.clients = [pubClient, subClient];
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.IO Redis 어댑터 사용');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  // 앱 종료(app.close) 시 소켓 서버를 닫은 뒤 호출됩니다.
  async dispose(): Promise<void> {
    await super.dispose();
    await Promise.allSettled(this.clients.map(client => client.quit()));
    this.clients = [];
  }
}
