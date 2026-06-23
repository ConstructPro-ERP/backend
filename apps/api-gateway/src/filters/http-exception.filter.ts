import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../../../../shared/error-codes';

@Catch() // catches everything — HttpException AND unexpected errors
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = ErrorCode.INTERNAL_ERROR as string;
    let message = 'An unexpected error occurred.';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = this.codeFromStatus(status);
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        code = r.code ?? this.codeFromStatus(status);

        // class-validator produces { message: string[] }
        if (Array.isArray(r.message)) {
          message = 'Validation failed.';
          details = r.message;
          code = ErrorCode.VALIDATION_ERROR;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message = r.message ?? message;
        }
      }
    } else if (exception instanceof Error) {
      message = this.isProd
        ? 'An unexpected error occurred.'
        : exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    const traceId = crypto.randomUUID();

    this.logger.error(
      JSON.stringify({ traceId, status, code, message, path: request?.url }),
    );

    const payload: Record<string, any> = {
      success: false,
      statusCode: status,
      code,
      message,
      traceId,
      path: request?.url,
      timestamp: new Date().toISOString(),
    };

    if (details.length) payload.details = details;

    response.status(status).json(payload);
  }

  private codeFromStatus(status: number): ErrorCode {
    const map: Record<number, ErrorCode> = {
      400: ErrorCode.VALIDATION_ERROR,
      401: ErrorCode.TOKEN_INVALID,
      403: ErrorCode.FORBIDDEN,
      404: ErrorCode.NOT_FOUND,
      409: ErrorCode.USER_ALREADY_EXISTS,
      422: ErrorCode.VALIDATION_ERROR,
      500: ErrorCode.INTERNAL_ERROR,
    };
    return map[status] ?? ErrorCode.INTERNAL_ERROR;
  }
}
