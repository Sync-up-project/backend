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
  constructor(private readonly authService: AuthService) {}

  /**
   * ✅ 로컬 회원가입
   * POST /auth/signup
   * - 성공 시 refresh 쿠키 + accessToken + user 반환
   */
  @Post('signup')
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

  /**
   * ✅ 로컬 로그인
   * POST /auth/login
   * - 성공 시 refresh 쿠키 + accessToken + user 반환
   */
  @Post('login')
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

  /**
   * Access Token 재발급 (refresh 쿠키 기반)
   * POST /auth/refresh
   */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = this.authService.getRefreshTokenFromCookies(req);
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const { accessToken, expiresIn } = await this.authService.rotateAccessToken(refreshToken);
    return res.status(200).json({ accessToken, expiresIn });
  }

  /**
   * 로그아웃
   * POST /auth/logout
   */
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const refreshToken = this.authService.getRefreshTokenFromCookies(req);
    if (refreshToken) {
      await this.authService.revokeRefreshSession(refreshToken);
    }
    this.authService.clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  }

  /**
   * 내 정보
   * GET /auth/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return { user };
  }

  /**
   * ✅ GitHub OAuth 시작
   * GET /auth/github?next=/projects
   */
  @Get('github')
  @UseGuards(GithubAuthGuard)
  async github() {
    // Guard가 GitHub로 redirect 처리합니다.
  }

  /**
   * ✅ GitHub OAuth 콜백
   * GET /auth/github/callback
   */
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const next = (req as any)?.cookies?.oauth_next;
      const safeNext = typeof next === 'string' && next.startsWith('/') ? next : '/projects';

      const result = await this.authService.loginGithub(req.user as any, req);
      this.authService.setRefreshCookie(res, result.refreshToken);

      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'success');
      url.searchParams.set('next', safeNext);
      url.searchParams.set('accessToken', result.accessToken);

      res.clearCookie('oauth_next', { path: '/auth/github' });
      return res.redirect(url.toString());
    } catch {
      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'failed');
      url.searchParams.set('next', '/projects');
      return res.redirect(url.toString());
    }
  }
}
