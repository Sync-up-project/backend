import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottleGuard } from '../../common/guards/throttle.guard';

/** 로그인·회원가입·토큰 갱신 rate limit */
@Injectable()
export class AuthThrottleGuard implements CanActivate {
  private readonly inner = new ThrottleGuard(20, 60_000);

  canActivate(context: ExecutionContext): boolean {
    return this.inner.canActivate(context);
  }
}
