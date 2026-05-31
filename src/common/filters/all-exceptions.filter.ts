import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { AppLogger } from '../logger/app-logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId = (req as Request & { requestId?: string }).requestId;
    const isProd = process.env.NODE_ENV === 'production';

    const mapped = this.mapException(exception, isProd);

    this.logger.error(mapped.logMessage, mapped.stack, {
      requestId,
      path: req.url,
      method: req.method,
      status: mapped.status,
      code: mapped.code,
    });

    res.status(mapped.status).json({
      success: false,
      code: mapped.code,
      message: mapped.message,
      requestId,
      ...(mapped.details && !isProd ? { details: mapped.details } : {}),
    });
  }

  private mapException(
    exception: unknown,
    isProd: boolean,
  ): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    logMessage: string;
    stack?: string;
  } {
    if (exception instanceof AppException) {
      const body = exception.getResponse() as {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      return {
        status: exception.getStatus(),
        code: body.code,
        message: body.message,
        details: body.details,
        logMessage: body.message,
        stack: exception.stack,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message ?? []).join(', ')
            : String((body as { message?: string }).message ?? exception.message);

      return {
        status,
        code: this.httpStatusToCode(status),
        message,
        logMessage: message,
        stack: exception.stack,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: '이미 존재하는 데이터입니다.',
          logMessage: `Prisma P2002: ${exception.meta}`,
          stack: exception.stack,
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: '요청한 리소스를 찾을 수 없습니다.',
          logMessage: `Prisma P2025`,
          stack: exception.stack,
        };
      }
    }

    const message = isProd
      ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      : exception instanceof Error
        ? exception.message
        : 'Unknown error';

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message,
      logMessage:
        exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    };
  }

  private httpStatusToCode(status: number): string {
    if (status === 401) return ErrorCode.UNAUTHORIZED;
    if (status === 403) return ErrorCode.FORBIDDEN;
    if (status === 404) return ErrorCode.NOT_FOUND;
    if (status === 409) return ErrorCode.CONFLICT;
    if (status === 429) return ErrorCode.RATE_LIMITED;
    if (status >= 500) return ErrorCode.INTERNAL_ERROR;
    return ErrorCode.VALIDATION_FAILED;
  }
}
