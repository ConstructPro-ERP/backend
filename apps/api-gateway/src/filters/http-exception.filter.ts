// typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch(HttpException, Error)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] | Record<string, any> =
      'Internal server error';
    let error: any = undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const anyRes = res as any;
        message = anyRes.message ?? anyRes.error ?? message;
        error = anyRes;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = this.isProd ? undefined : { stack: exception.stack };
    }

    const payload: Record<string, any> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url,
      method: request?.method,
      message,
    };

    if (error) payload.error = error;

    this.logger.error(
      typeof message === 'string' ? message : JSON.stringify(message),
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(payload);
  }
}