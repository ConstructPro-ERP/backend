import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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

        if (
          data &&
          typeof data === 'object' &&
          ('items' in data || 'total' in data)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
          envelope.data = data.items ?? data;
          envelope.meta = {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
            total: data.total,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
            page: data.page,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
            limit: data.limit,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
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
