import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { Request } from 'express';
import { ErrorCode } from '../../../../shared/error-codes';

type AuthRequest = Request & { user?: any };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(private readonly httpService: HttpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_MISSING,
        message: 'Authorization header is missing or malformed.',
      });
    }

    const token = auth.slice(7);
    try {
      const resp = await firstValueFrom(
        this.httpService.get(
          `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333'}/auth/me`,
          { headers: { authorization: `Bearer ${token}` } },
        ),
      );
      req.user = resp.data?.data ?? resp.data;
      return true;
    } catch (err: any) {
      const downstreamCode =
        err?.response?.data?.code ?? ErrorCode.TOKEN_INVALID;
      const isExpired = downstreamCode === ErrorCode.TOKEN_EXPIRED;

      this.logger.warn(`Token validation failed [${downstreamCode}]`);

      throw new UnauthorizedException({
        code: isExpired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID,
        message: isExpired
          ? 'Your session has expired. Please log in again.'
          : 'Token is invalid or has been revoked.',
      });
    }
  }
}
