import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown[] | undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        code = r.code ?? r.error ?? 'INTERNAL_ERROR';
        if (Array.isArray(r.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed.';
          details = r.message as unknown[];
        } else {
          message = r.message ?? message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const body: Record<string, unknown> = { code, message };
    if (details?.length) body.details = details;

    response.status(status).json(body);
  }
}
