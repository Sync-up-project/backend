import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodeType } from './error-codes';

export type AppExceptionOptions = {
  code: ErrorCodeType;
  message: string;
  status: HttpStatus;
  details?: Record<string, unknown>;
};

export class AppException extends HttpException {
  readonly code: ErrorCodeType;
  readonly details?: Record<string, unknown>;

  constructor(options: AppExceptionOptions) {
    super(
      {
        code: options.code,
        message: options.message,
        details: options.details,
      },
      options.status,
    );
    this.code = options.code;
    this.details = options.details;
  }
}

export function validationException(
  message: string,
  details?: Record<string, unknown>,
): AppException {
  return new AppException({
    code: ErrorCode.VALIDATION_FAILED,
    message,
    status: HttpStatus.BAD_REQUEST,
    details,
  });
}
