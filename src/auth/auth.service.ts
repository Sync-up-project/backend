import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';

type LocalSignupInput = {
  email: string;
  password: string;
  nickname: string;
};

type LocalLoginInput = {
  email: string;
  password: string;
};

type JwtAccessPayload = { sub: string };
type JwtRefreshPayload = { sub: string; sid: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signupLocal(input: LocalSignupInput, req: Request) {
    const email = input.email.trim().toLowerCase();
    const nickname = input.nickname.trim();

    if (!email) throw new BadRequestException('Invalid email');
    if (input.password.length < 6) throw new BadRequestException('Password must be at least 6 chars');
    if (nickname.length < 2) throw new BadRequestException('Nickname must be at least 2 chars');

    const emailExists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailExists) throw new BadRequestException('Email already in use');

    const nicknameExists = await this.prisma.user.findFirst({
      where: { nickname },
      select: { id: true },
    });
    if (nicknameExists) throw new BadRequestException('Nickname already in use');

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        nickname,
        passwordHash,
        profileImageUrl: null,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        profileImageUrl: true,
      },
    });

    const tokens = await this.issueTokensForUserId(user.id, req);

    return {
      ...tokens,
      user,
    };
  }

  async loginLocal(input: LocalLoginInput, req: Request) {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        profileImageUrl: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    const tokens = await this.issueTokensForUserId(user.id, req);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
    };
  }

  async rotateAccessToken(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, refreshTokenHash: true, expiresAt: true },
    });

    if (!session) throw new UnauthorizedException('Refresh session not found');
    if (session.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh session expired');

    const ok = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh token');

    const accessToken = await this.signAccessToken(payload.sub);
    const expiresIn = this.parseExpiresToSeconds(process.env.JWT_ACCESS_EXPIRES_IN || '15m');

    return { accessToken, expiresIn };
  }

  async revokeRefreshSession(refreshToken: string) {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshSession.deleteMany({
        where: { id: payload.sid, userId: payload.sub },
      });
    } catch {
      // ignore
    }
  }

  setRefreshCookie(res: any, refreshToken: string) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth',
      maxAge: this.parseExpiresToMilliseconds(process.env.JWT_REFRESH_EXPIRES_IN || '30d'),
    });
  }

  clearRefreshCookie(res: any) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none';

    res.cookie('refresh_token', '', {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth',
      maxAge: 0,
    });
  }

  getRefreshTokenFromCookies(req: Request): string | null {
    const token = (req as any).cookies?.refresh_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  private async issueTokensForUserId(userId: string, req: Request) {
    const refreshExpiresAt = this.calcFutureDate(process.env.JWT_REFRESH_EXPIRES_IN || '30d');

    const refreshSession = await this.prisma.refreshSession.create({
      data: {
        userId,
        refreshTokenHash: 'TEMP',
        expiresAt: refreshExpiresAt,
        userAgent: req.headers['user-agent'] || null,
        ip: this.getIp(req),
      },
      select: { id: true },
    });

    const accessToken = await this.signAccessToken(userId);
    const refreshToken = await this.signRefreshToken(userId, refreshSession.id);

    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.refreshSession.update({
      where: { id: refreshSession.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresToSeconds(process.env.JWT_ACCESS_EXPIRES_IN || '15m'),
    };
  }

  private async signAccessToken(userId: string) {
    const payload: JwtAccessPayload = { sub: userId };
    const expiresInSeconds = this.parseExpiresToSeconds(process.env.JWT_ACCESS_EXPIRES_IN || '15m');

    return this.jwt.signAsync(payload as any, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: expiresInSeconds,
    } as any);
  }

  private async signRefreshToken(userId: string, sessionId: string) {
    const payload: JwtRefreshPayload = { sub: userId, sid: sessionId };
    const expiresInSeconds = this.parseExpiresToSeconds(process.env.JWT_REFRESH_EXPIRES_IN || '30d');

    return this.jwt.signAsync(payload as any, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: expiresInSeconds,
    } as any);
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
    if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
    return (req.socket?.remoteAddress as string) || null;
  }

  private parseExpiresToSeconds(expires: string): number {
    return Math.floor(this.parseExpiresToMilliseconds(expires) / 1000);
  }

  private parseExpiresToMilliseconds(expires: string): number {
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
