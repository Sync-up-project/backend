import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthThrottleGuard } from './guards/auth-throttle.guard';
import { AppLogger } from '../common/logger/app-logger.service';

type SignupBody = {
  email: string;
  password: string;
  nickname: string;
};

type LoginBody = {
  email: string;
  password: string;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Post('signup')
  @UseGuards(AuthThrottleGuard)
  async signup(@Body() body: SignupBody, @Req() req: Request, @Res() res: Response) {
    if (!body?.email || !body?.password || !body?.nickname) {
      throw new BadRequestException('email, password, nickname are required');
    }

    const result = await this.authService.signupLocal(
      {
        email: body.email,
        password: body.password,
        nickname: body.nickname,
      },
      req,
    );

    this.authService.setRefreshCookie(res, result.refreshToken);
    return res.status(201).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  }

  @Post('login')
  @UseGuards(AuthThrottleGuard)
  async login(@Body() body: LoginBody, @Req() req: Request, @Res() res: Response) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('email, password are required');
    }

    const result = await this.authService.loginLocal(
      {
        email: body.email,
        password: body.password,
      },
      req,
    );

    this.authService.setRefreshCookie(res, result.refreshToken);
    return res.status(200).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  }

  @Post('refresh')
  @UseGuards(AuthThrottleGuard)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = this.authService.getRefreshTokenFromCookies(req);
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const result = await this.authService.rotateAccessToken(refreshToken, req);
    this.authService.setRefreshCookie(res, result.refreshToken);
    return res.status(200).json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const refreshToken = this.authService.getRefreshTokenFromCookies(req);
    if (refreshToken) {
      await this.authService.revokeRefreshSession(refreshToken);
    }
    this.authService.clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: unknown) {
    return { user };
  }

  /**
   * GitHub OAuth 완료 후 1회성 access token 수령 (HttpOnly 쿠키 → JSON, URL 미노출)
   */
  @Get('oauth/session')
  async oauthSession(@Req() req: Request, @Res() res: Response) {
    const accessToken = this.authService.consumeOAuthAccessCookie(req);
    this.authService.clearOAuthAccessCookie(res);

    if (!accessToken) {
      throw new UnauthorizedException('OAuth session expired or missing');
    }

    return res.status(200).json({ accessToken });
  }

  @Get('github')
  @UseGuards(GithubAuthGuard)
  async github() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';

    try {
      const next = (req as Request & { cookies?: Record<string, string> }).cookies
        ?.oauth_next;
      const safeNext =
        typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
          ? next
          : '/projects';

      const result = await this.authService.loginGithub(req.user as object, req);
      this.authService.setRefreshCookie(res, result.refreshToken);
      this.authService.setOAuthAccessCookie(res, result.accessToken);

      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'success');
      url.searchParams.set('next', safeNext);

      res.clearCookie('oauth_next', { path: '/auth/github' });
      return res.redirect(url.toString());
    } catch (err) {
      this.logger.error(
        'GitHub OAuth callback failed',
        err instanceof Error ? err.stack : undefined,
      );

      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'failed');
      url.searchParams.set('next', '/projects');
      return res.redirect(url.toString());
    }
  }
}
