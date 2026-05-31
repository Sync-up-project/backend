import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const requestId = (req as Request & { requestId?: string }).requestId;

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - started;
          this.logger.log('HTTP request completed', {
            requestId,
            method: req.method,
            path: req.url,
            status: res.statusCode,
            durationMs: ms,
          });
        },
        error: (err: unknown) => {
          const ms = Date.now() - started;
          this.logger.warn('HTTP request failed', {
            requestId,
            method: req.method,
            path: req.url,
            durationMs: ms,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      }),
    );
  }
}
