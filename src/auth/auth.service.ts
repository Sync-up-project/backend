import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { AccountRole, AuthProvider, AuditAction } from '@prisma/client';
import { randomUUID } from 'crypto';

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
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signupLocal(input: LocalSignupInput, req: Request) {
    const email = input.email.trim().toLowerCase();
    const nickname = input.nickname.trim();

    if (!email) throw new BadRequestException('Invalid email');
    if (input.password.length < 6)
      throw new BadRequestException('Password must be at least 6 chars');
    if (nickname.length < 2)
      throw new BadRequestException('Nickname must be at least 2 chars');

    const emailExists = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailExists) throw new BadRequestException('Email already in use');

    const nicknameExists = await this.prisma.user.findFirst({
      where: { nickname },
      select: { id: true },
    });
    if (nicknameExists)
      throw new BadRequestException('Nickname already in use');

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
        accountRole: true,
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
        accountRole: true,
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
        accountRole: user.accountRole,
        profileImageUrl: user.profileImageUrl,
      },
    };
  }

  async loginAdminLocal(input: LocalLoginInput, req: Request) {
    const result = await this.loginLocal(input, req);

    if (result.user.accountRole !== AccountRole.ADMIN) {
      await this.revokeRefreshSession(result.refreshToken);
      throw new UnauthorizedException('Admin account required');
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: result.user.id,
        action: AuditAction.CREATE,
        entityType: 'AdminSession',
        entityId: result.user.id,
        summary: 'Admin login',
        diffJson: {
          ip: this.getIp(req),
          userAgent: req.headers['user-agent'] || null,
        },
      },
    });

    return result;
  }

  /**
   * ✅ 리프레시 토큰 회전 (Refresh Token Rotation)
   * - 갱신할 때마다 새 리프레시 토큰을 발급하고, 사용한 토큰은 폐기(revoked)합니다.
   * - 새 세션은 같은 familyId를 이어받고, 최초 로그인 시점의 만료일을 유지합니다.
   *   (갱신을 반복해도 로그인 후 최대 유효기간은 늘어나지 않음)
   * - 이미 폐기된 토큰이 다시 사용되면 탈취로 보고 같은 family의 세션을 모두 폐기합니다.
   *   단, 여러 요청/탭이 거의 동시에 갱신하는 경우를 위해 짧은 유예 시간을 둡니다.
   *
   * 반환값의 refreshToken이 null이면 쿠키를 갱신하지 않습니다(유예 시간 내 재요청).
   */
  async rotateRefreshToken(refreshToken: string, req: Request) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        familyId: true,
        refreshTokenHash: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
        replacedBySessionId: true,
      },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh session not found');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh session expired');
    }

    const ok = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      return this.handleRevokedRefreshToken(session);
    }

    const now = new Date();

    // 1) 기존 세션 선점: revokedAt이 null일 때만 갱신되므로
    //    같은 토큰으로 동시에 요청이 와도 한 요청만 회전에 성공합니다.
    const claimed = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'ROTATED', lastUsedAt: now },
    });
    if (claimed.count === 0) {
      // 동시 요청에 밀린 경우: 최신 상태로 다시 확인
      const latest = await this.prisma.refreshSession.findUnique({
        where: { id: session.id },
        select: {
          id: true,
          userId: true,
          familyId: true,
          revokedAt: true,
          revokedReason: true,
          replacedBySessionId: true,
        },
      });
      if (!latest) throw new UnauthorizedException('Refresh session not found');
      return this.handleRevokedRefreshToken(latest);
    }

    // 2) 같은 family로 새 세션 + 새 리프레시 토큰 발급
    const child = await this.prisma.refreshSession.create({
      data: {
        user: { connect: { id: session.userId } },
        familyId: session.familyId,
        parentSession: { connect: { id: session.id } },
        refreshTokenHash: 'TEMP',
        expiresAt: session.expiresAt,
        userAgent: req.headers['user-agent'] || null,
        ip: this.getIp(req),
      },
      select: { id: true },
    });

    const newRefreshToken = await this.signRefreshToken(
      session.userId,
      child.id,
    );
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);

    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: child.id },
        data: { refreshTokenHash: newRefreshHash },
      }),
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { replacedBySessionId: child.id },
      }),
    ]);

    const accessToken = await this.signAccessToken(session.userId);

    return {
      accessToken,
      refreshToken: newRefreshToken as string | null,
      expiresIn: this.parseExpiresToSeconds(
        process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      ),
    };
  }

  /**
   * 이미 폐기된 리프레시 토큰이 들어온 경우 처리
   * - 회전 직후 유예 시간 내 재요청(동시 요청·다중 탭): 액세스 토큰만 발급
   *   (새 리프레시 토큰은 먼저 성공한 응답의 쿠키로 이미 전달됨)
   * - 그 외: 토큰 재사용(탈취 의심)으로 보고 같은 family 세션 전체 폐기
   */
  private async handleRevokedRefreshToken(session: {
    id: string;
    userId: string;
    familyId: string;
    revokedAt: Date | null;
    revokedReason: string | null;
    replacedBySessionId: string | null;
  }) {
    const graceMs = this.parseExpiresToMilliseconds(
      process.env.JWT_REFRESH_REUSE_GRACE || '30s',
    );
    const withinGrace =
      session.revokedReason === 'ROTATED' &&
      !!session.revokedAt &&
      Date.now() - session.revokedAt.getTime() <= graceMs;

    if (withinGrace) {
      // 교체된 새 세션이 아직 살아있을 때만 허용
      const replacement = session.replacedBySessionId
        ? await this.prisma.refreshSession.findUnique({
            where: { id: session.replacedBySessionId },
            select: { revokedAt: true, revokedReason: true },
          })
        : null;
      const replacementAlive =
        !session.replacedBySessionId || // 회전 처리 중(아직 연결 전)
        (!!replacement &&
          (!replacement.revokedAt || replacement.revokedReason === 'ROTATED'));

      if (replacementAlive) {
        const accessToken = await this.signAccessToken(session.userId);
        return {
          accessToken,
          refreshToken: null as string | null,
          expiresIn: this.parseExpiresToSeconds(
            process.env.JWT_ACCESS_EXPIRES_IN || '15m',
          ),
        };
      }
    }

    if (session.revokedReason === 'ROTATED') {
      // 회전된 토큰이 유예 시간 이후 다시 사용됨 → 탈취 의심, family 전체 폐기
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.refreshSession.update({
          where: { id: session.id },
          data: { reuseDetectedAt: now },
        }),
        this.prisma.refreshSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'REUSE_DETECTED' },
        }),
      ]);
      this.logger.warn(
        `Refresh token reuse detected (user=${session.userId}, family=${session.familyId})`,
      );
    }

    throw new UnauthorizedException('Refresh token revoked');
  }

  /**
   * ✅ GitHub OAuth 로그인/회원가입
   * - OAuthAccount(provider+providerUserId) 기준으로 연결된 user를 찾거나 생성합니다.
   * - email은 GitHub에서 없을 수 있어 nullable을 허용합니다.
   */
  async loginGithub(
    githubUser: {
      githubId?: string | number;
      username?: string | null;
      email?: string | null;
      avatarUrl?: string | null;
    },
    req: Request,
  ) {
    const providerUserId = githubUser?.githubId
      ? String(githubUser.githubId)
      : '';
    if (!providerUserId)
      throw new BadRequestException('Invalid GitHub profile');

    const username = githubUser?.username ? String(githubUser.username) : null;
    const emailRaw = githubUser?.email
      ? String(githubUser.email).trim().toLowerCase()
      : null;
    const avatarUrl = githubUser?.avatarUrl
      ? String(githubUser.avatarUrl)
      : null;
    const fallbackNickname = username ?? `github-${providerUserId}`;

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

    // OAuthAccount가 없고 email이 있는 경우: 기존 유저(email)와 연결 시도
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
            accountRole: true,
            profileImageUrl: true,
          },
        })
      : await this.prisma.user.create({
          data: {
            email: emailRaw,
            passwordHash: null,
            nickname: fallbackNickname,
            profileImageUrl: avatarUrl,
            githubUsername: username,
            githubUrl: username ? `https://github.com/${username}` : null,
          },
          select: {
            id: true,
            email: true,
            nickname: true,
            role: true,
            accountRole: true,
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

    const tokens = await this.issueTokensForUserId(user.id, req);

    return {
      ...tokens,
      user,
    };
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
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as
      | 'lax'
      | 'strict'
      | 'none';

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/auth',
      maxAge: this.parseExpiresToMilliseconds(
        process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      ),
    });
  }

  clearRefreshCookie(res: any) {
    const secure = (process.env.COOKIE_SECURE || 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE || 'lax') as
      | 'lax'
      | 'strict'
      | 'none';

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
    const refreshExpiresAt = this.calcFutureDate(
      process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    );

    const refreshSession = await this.prisma.refreshSession.create({
      data: {
        user: { connect: { id: userId } },
        familyId: randomUUID(),
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
      expiresIn: this.parseExpiresToSeconds(
        process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      ),
    };
  }

  private async signAccessToken(userId: string) {
    const payload: JwtAccessPayload = { sub: userId };
    const expiresInSeconds = this.parseExpiresToSeconds(
      process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    );

    return this.jwt.signAsync(
      payload as any,
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: expiresInSeconds,
      } as any,
    );
  }

  private async signRefreshToken(userId: string, sessionId: string) {
    const payload: JwtRefreshPayload = { sub: userId, sid: sessionId };
    const expiresInSeconds = this.parseExpiresToSeconds(
      process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    );

    return this.jwt.signAsync(
      payload as any,
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: expiresInSeconds,
      } as any,
    );
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
