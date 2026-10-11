import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function isPaginatedResponse(value: unknown): value is {
  items: unknown[];
  total: number;
  page?: number;
  limit?: number;
  totalPages?: number;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray(value.items) &&
    'total' in value &&
    typeof value.total === 'number'
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        const envelope: Record<string, any> = {
          success: true, // ← added; errors always have success: false
          statusCode: res.statusCode,
          path: req?.url,
          timestamp: new Date().toISOString(),
        };

        if (isPaginatedResponse(data)) {
          envelope.data = data.items ?? data;
          envelope.meta = {
            total: data.total,

            page: data.page,

            limit: data.limit,

            totalPages: data.totalPages,
          };
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          envelope.data = data;
        }

        return envelope;
      }),
    );
  }
}
