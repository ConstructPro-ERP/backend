// File: `backend/apps/api-gateway/src/guards/jwt-auth.guard.ts`
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

type AuthRequest = Request & { user?: any };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(private readonly httpService: HttpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }

    const token = auth.slice(7);
    try {
      // forward token to auth service to validate and fetch user
      const resp = await firstValueFrom(
        this.httpService.get('http://localhost:3333/auth/me', {
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      // attach validated user to request for downstream use (guards/controllers)
      req.user = resp.data;
      return true;
    } catch (err: any) {
      this.logger.warn('Token validation failed', err?.message ?? err);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}