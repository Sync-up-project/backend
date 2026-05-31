import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAccessPayload, JwtRefreshPayload } from '../types';

const BCRYPT_ROUNDS = 12;

/**
 * JWT·리프레시 세션 발급/검증 (인프라/애플리케이션 계층).
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async issueTokensForUserId(userId: string, req: Request) {
    const refreshExpiresAt = this.calcFutureDate(
      process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    );

    const accessToken = await this.signAccessToken(userId);
    const refreshSession = await this.prisma.refreshSession.create({
      data: {
        userId,
        refreshTokenHash: 'PENDING',
        expiresAt: refreshExpiresAt,
        userAgent: req.headers['user-agent'] || null,
        ip: this.getIp(req),
      },
      select: { id: true },
    });

    const refreshToken = await this.signRefreshToken(userId, refreshSession.id);
    const refreshHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

    await this.prisma.refreshSession.update({
      where: { id: refreshSession.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresToSeconds(
        process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      ),
    };
  }

  /** Refresh token rotation: 새 access + 새 refresh 발급 */
  async rotateAccessToken(refreshToken: string, req: Request) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh session not found');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshSession.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('Refresh session expired');
    }

    const ok = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!ok) {
      await this.prisma.refreshSession.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshSession.delete({ where: { id: session.id } });

    return this.issueTokensForUserId(session.userId, req);
  }

  async revokeRefreshSession(refreshToken: string): Promise<void> {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshSession.deleteMany({
        where: { id: payload.sid, userId: payload.sub },
      });
    } catch {
      // ignore invalid token on logout
    }
  }

  private async signAccessToken(userId: string): Promise<string> {
    const payload: JwtAccessPayload = { sub: userId };
    const expiresInSeconds = this.parseExpiresToSeconds(
      process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    );

    return this.jwt.signAsync(payload as object, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: expiresInSeconds,
    });
  }

  private async signRefreshToken(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    const payload: JwtRefreshPayload = { sub: userId, sid: sessionId };
    const expiresInSeconds = this.parseExpiresToSeconds(
      process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    );

    return this.jwt.signAsync(payload as object, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: expiresInSeconds,
    });
  }

  private async verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
    try {
      return await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private getIp(req: Request): string | null {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return xf.split(',')[0].trim();
    }
    return (req.socket?.remoteAddress as string) || null;
  }

  private parseExpiresToSeconds(expires: string): number {
    return Math.floor(this.parseExpiresToMilliseconds(expires) / 1000);
  }

  parseExpiresToMilliseconds(expires: string): number {
    const m = /^(\d+)\s*([smhd])$/.exec(expires.trim());
    if (!m) return 30 * 24 * 60 * 60 * 1000;

    const n = Number(m[1]);
    const unit = m[2];
    if (unit === 's') return n * 1000;
    if (unit === 'm') return n * 60 * 1000;
    if (unit === 'h') return n * 60 * 60 * 1000;
    return n * 24 * 60 * 60 * 1000;
  }

  private calcFutureDate(expires: string): Date {
    return new Date(Date.now() + this.parseExpiresToMilliseconds(expires));
  }
}
