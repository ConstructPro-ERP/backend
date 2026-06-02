// File: `backend/apps/api-gateway/src/guards/roles.guard.ts`
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { Request } from 'express';

type AuthRequest = Request & { user?: any };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
   
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      context.getHandler(),
      context.getClass(),
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // no roles required
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user as any;
    if (!user) {
      throw new ForbiddenException('User not available for role check');
    }

    const userRoles: string[] =
      Array.isArray(user.roles) ? user.roles : (user.role ? [String(user.role)] : []);
    const hasRole = requiredRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}