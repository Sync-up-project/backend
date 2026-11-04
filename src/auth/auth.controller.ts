import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
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
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * ✅ 로컬 회원가입
   * POST /auth/signup
   * - 성공 시 refresh 쿠키 + accessToken + user 반환
   */
  @Post('signup')
  async signup(
    @Body() body: SignupBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
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
  async login(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
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

  @Post('admin/login')
  async adminLogin(
    @Body() body: LoginBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('email, password are required');
    }

    const result = await this.authService.loginAdminLocal(
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

    let result: Awaited<ReturnType<AuthService['rotateRefreshToken']>>;
    try {
      result = await this.authService.rotateRefreshToken(refreshToken, req);
    } catch (err) {
      // 만료·폐기된 토큰이면 쿠키도 지워서 클라이언트가 재로그인하도록 유도
      this.authService.clearRefreshCookie(res);
      throw err;
    }

    // 새 리프레시 토큰이 발급된 경우에만 쿠키 교체
    // (동시 요청 유예 시간 내 재요청이면 null → 먼저 성공한 응답이 설정한 쿠키 유지)
    if (result.refreshToken) {
      this.authService.setRefreshCookie(res, result.refreshToken);
    }

    return res
      .status(200)
      .json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
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
      const safeNext =
        typeof next === 'string' && next.startsWith('/') ? next : '/projects';

      const result = await this.authService.loginGithub(req.user as any, req);
      this.authService.setRefreshCookie(res, result.refreshToken);

      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'success');
      url.searchParams.set('next', safeNext);
      url.searchParams.set('accessToken', result.accessToken);

      res.clearCookie('oauth_next', { path: '/auth/github' });
      return res.redirect(url.toString());
    } catch (err) {
      this.logger.error(
        `GitHub OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const url = new URL(`${frontendBase}/login`);
      url.searchParams.set('oauth', 'failed');
      url.searchParams.set('next', '/projects');
      return res.redirect(url.toString());
    }
  }
}
