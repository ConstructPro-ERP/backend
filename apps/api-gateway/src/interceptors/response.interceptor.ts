// typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        const envelope: Record<string, any> = {
          statusCode: ctx.getResponse()?.statusCode ?? 200,
          timestamp: new Date().toISOString(),
          path: req?.url,
          method: req?.method,
          data,
        };

        // normalize simple pagination shape
        if (data && typeof data === 'object' && ('items' in data || 'total' in data)) {
          envelope.data = (data as any).items ?? envelope.data;
          envelope.meta = { total: (data as any).total, page: (data as any).page };
        }

        return envelope;
      }),
    );
  }
}