import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * ✅ GitHub OAuth 시작용 Guard
 * - /auth/github?next=/projects 처럼 전달된 next 값을 HttpOnly 쿠키로 임시 저장합니다.
 * - callback에서 읽어 프론트 redirect 경로에 반영합니다.
 */
@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any = context.switchToHttp().getRequest();
    const res: any = context.switchToHttp().getResponse();

    const next = typeof req?.query?.next === 'string' ? req.query.next : null;
    const safeNext =
      next && next.startsWith('/') && !next.startsWith('//') ? next : '/projects';

    // callback에서만 쓰는 값이라 짧게 유지
    res.cookie('oauth_next', safeNext, {
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.COOKIE_SECURE || 'false') === 'true',
      path: '/auth/github',
      maxAge: 5 * 60 * 1000,
    });

    return (await super.canActivate(context)) as boolean;
  }
}

