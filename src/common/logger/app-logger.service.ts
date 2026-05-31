import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

type LogMeta = Record<string, unknown>;

@Injectable()
export class AppLogger implements LoggerService {
  private contextName = 'Application';

  setContext(context: string): void {
    this.contextName = context;
  }

  log(message: string, meta?: LogMeta): void {
    this.write('log', message, meta);
  }

  error(message: string, trace?: string, meta?: LogMeta): void {
    this.write('error', message, { ...meta, trace });
  }

  warn(message: string, meta?: LogMeta): void {
    this.write('warn', message, meta);
  }

  debug(message: string, meta?: LogMeta): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.write('debug', message, meta);
    }
  }

  verbose(message: string, meta?: LogMeta): void {
    if (process.env.LOG_LEVEL === 'verbose' || process.env.LOG_LEVEL === 'debug') {
      this.write('verbose', message, meta);
    }
  }

  private write(level: LogLevel, message: string, meta?: LogMeta): void {
    const payload = {
      ts: new Date().toISOString(),
      level,
      context: this.contextName,
      message,
      ...meta,
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}
