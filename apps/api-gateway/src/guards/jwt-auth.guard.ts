import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { ErrorCode } from '../../../../shared/error-codes';
import { getAuthServiceUrl } from '../auth-service-url';

type AuthenticatedUser = { [key: string]: unknown };
type AuthRequest = Request & { user?: AuthenticatedUser };
type AuthServicePayload = AuthenticatedUser | { data?: AuthenticatedUser };
type AuthServiceError = { code?: ErrorCode | string };

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly authServiceUrl = getAuthServiceUrl();

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
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.authServiceUrl}/auth/me`,
          { headers: { authorization: `Bearer ${token}` } },
        ),
      );
      const payload = response.data as AuthServicePayload;
      const user =
        'data' in payload && isAuthenticatedUser(payload.data)
          ? payload.data
          : payload;

      if (!isAuthenticatedUser(user)) {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Token is invalid or has been revoked.',
        });
      }

      req.user = user;
      return true;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<AuthServiceError>;
      const downstreamCode =
        axiosError.response?.data?.code ?? ErrorCode.TOKEN_INVALID;
      const isExpired =
        String(downstreamCode) === String(ErrorCode.TOKEN_EXPIRED);

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
