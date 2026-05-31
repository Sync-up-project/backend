import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthTokenService } from './application/auth-token.service';
import {
  assertEmailFormat,
  assertNicknameFormat,
  assertPasswordPolicy,
  normalizeEmail,
  normalizeNickname,
} from '../domain/auth/password.policy';
import { AppLogger } from '../common/logger/app-logger.service';

type LocalSignupInput = {
  email: string;
  password: string;
  nickname: string;
};

type LocalLoginInput = {
  email: string;
  password: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async signupLocal(input: LocalSignupInput, req: Request) {
    const email = normalizeEmail(input.email);
    const nickname = normalizeNickname(input.nickname);

    assertEmailFormat(email);
    assertPasswordPolicy(input.password);
    assertNicknameFormat(nickname);

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

    const passwordHash = await bcrypt.hash(input.password, 12);

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

    const tokenResult = await this.tokens.issueTokensForUserId(user.id, req);

    return { ...tokenResult, user };
  }

  async loginLocal(input: LocalLoginInput, req: Request) {
    const email = normalizeEmail(input.email);

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

    const tokenResult = await this.tokens.issueTokensForUserId(user.id, req);

    return {
      ...tokenResult,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
    };
  }

  async rotateAccessToken(refreshToken: string, req: Request) {
    return this.tokens.rotateAccessToken(refreshToken, req);
  }

  async loginGithub(
    githubUser: {
      githubId?: string | number;
      username?: string | null;
      email?: string | null;
      avatarUrl?: string | null;
    },
    req: Request,
  ) {
    const providerUserId = githubUser?.githubId ? String(githubUser.githubId) : '';
    if (!providerUserId) throw new BadRequestException('Invalid GitHub profile');

    const username = githubUser?.username ? String(githubUser.username) : null;
    const emailRaw = githubUser?.email
      ? normalizeEmail(String(githubUser.email))
      : null;
    const avatarUrl = githubUser?.avatarUrl ? String(githubUser.avatarUrl) : null;

    const oauth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GITHUB,
          providerUserId,
        },
      },
      select: { userId: true },
    });

    let userId = oauth?.userId ?? null;

    if (!userId && emailRaw) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: emailRaw },
        select: { id: true },
      });
      userId = byEmail?.id ?? null;
    }

    const user = userId
      ? await this.prisma.user.update({
          where: { id: userId },
          data: {
            githubUsername: username ?? undefined,
            githubUrl: username ? `https://github.com/${username}` : undefined,
            profileImageUrl: avatarUrl ?? undefined,
            email: emailRaw ?? undefined,
            nickname: username ?? undefined,
          },
          select: {
            id: true,
            email: true,
            nickname: true,
            role: true,
            profileImageUrl: true,
          },
        })
      : await this.prisma.user.create({
          data: {
            email: emailRaw,
            passwordHash: null,
            nickname: username,
            profileImageUrl: avatarUrl,
            githubUsername: username,
            githubUrl: username ? `https://github.com/${username}` : null,
          },
          select: {
            id: true,
            email: true,
            nickname: true,
            role: true,
            profileImageUrl: true,
          },
        });

    await this.prisma.oAuthAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.GITHUB,
          providerUserId,
        },
      },
      update: {
        userId: user.id,
        username: username ?? undefined,
        revokedAt: null,
      },
      create: {
        userId: user.id,
        provider: AuthProvider.GITHUB,
        providerUserId,
        username: username ?? undefined,
      },
      select: { id: true },
    });

    const tokenResult = await this.tokens.issueTokensForUserId(user.id, req);
    return { ...tokenResult, user };
  }

  async revokeRefreshSession(refreshToken: string) {
    return this.tokens.revokeRefreshSession(refreshToken);
  }

  /** OAuth 후 1회성 access token (URL 노출 방지) */
  setOAuthAccessCookie(res: Response, accessToken: string) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none';

    res.cookie('oauth_access_once', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth/oauth',
      maxAge: 60_000,
    });
  }

  consumeOAuthAccessCookie(req: Request): string | null {
    const token = (req as Request & { cookies?: Record<string, string> }).cookies
      ?.oauth_access_once;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }

  clearOAuthAccessCookie(res: Response) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none';

    res.cookie('oauth_access_once', '', {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth/oauth',
      maxAge: 0,
    });
  }

  setRefreshCookie(res: Response, refreshToken: string) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth',
      maxAge: this.tokens.parseExpiresToMilliseconds(
        process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      ),
    });
  }

  clearRefreshCookie(res: Response) {
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
    const token = (req as Request & { cookies?: Record<string, string> }).cookies
      ?.refresh_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  }
}
