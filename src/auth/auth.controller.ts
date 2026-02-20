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
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
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
}
