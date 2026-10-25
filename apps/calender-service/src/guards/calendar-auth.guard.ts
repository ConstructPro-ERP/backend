import { HttpService } from '@nestjs/axios';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { ErrorCode } from '../../../../shared/error-codes';

export interface CalendarAuthenticatedUser {
  id: string;
  email?: string;
  fullName?: string;
  role?: string | null;
  [key: string]: unknown;
}

export interface CalendarAuthenticatedRequest extends Request {
  user?: CalendarAuthenticatedUser;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractUser(payload: unknown): CalendarAuthenticatedUser | null {
  if (!isRecord(payload)) {
    return null;
  }

  const candidate =
    'data' in payload && isRecord(payload.data) ? payload.data : payload;

  if (typeof candidate.id !== 'string') {
    return null;
  }

  return {
    ...candidate,
    id: candidate.id,
  };
}

@Injectable()
export class CalendarAuthGuard implements CanActivate {
  constructor(private readonly httpService: HttpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<CalendarAuthenticatedRequest>();

    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_MISSING,
        message: 'Authorization header is missing or malformed.',
      });
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(
          `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:3333'}/auth/me`,
          {
            headers: {
              authorization,
            },
          },
        ),
      );

      const user = extractUser(response.data);

      if (!user) {
        throw new Error('Auth service returned an invalid user.');
      }

      req.user = user;

      return true;
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Token is invalid or has been revoked.',
      });
    }
  }
}
