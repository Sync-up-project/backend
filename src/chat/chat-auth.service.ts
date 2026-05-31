import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppLogger } from '../common/logger/app-logger.service';

type AccessPayload = { sub: string };

/**
 * WebSocket handshake JWT 검증 (인프라 계층).
 */
@Injectable()
export class ChatAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(ChatAuthService.name);
  }

  async verifyAccessToken(token: unknown): Promise<string> {
    if (typeof token !== 'string' || token.length < 10) {
      throw new UnauthorizedException('채팅 인증 토큰이 필요합니다.');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (!payload?.sub) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }
      return payload.sub;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn('Chat socket JWT verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new UnauthorizedException('채팅 인증에 실패했습니다.');
    }
  }
}
