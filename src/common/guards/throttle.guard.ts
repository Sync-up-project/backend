import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ErrorCode } from '../exceptions/error-codes';

type Bucket = { count: number; resetAt: number };

/**
 * 인메모리 슬라이딩 윈도우 rate limit (단일 인스턴스용).
 * 운영 멀티 인스턴스에서는 Redis 기반으로 교체 권장.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const key = this.buildKey(req);
    const now = Date.now();

    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > this.limit) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildKey(req: Request): string {
    const ip =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.socket.remoteAddress) ?? 'unknown';
    return `${req.method}:${req.path}:${ip}`;
  }
}
