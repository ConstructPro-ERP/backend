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

type AuthenticatedUser = { roles?: unknown; role?: unknown };
type AuthRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride expects the metadata key and an array of targets
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // no roles required
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('User not available for role check');
    }

    const userRoles: string[] = Array.isArray(user.roles)
      ? user.roles.filter((role): role is string => typeof role === 'string')
      : typeof user.role === 'string'
        ? [user.role]
        : [];
    const normalizedUserRoles = userRoles.map(normalizeRole);
    const hasRole = requiredRoles
      .map(normalizeRole)
      .some((role) => normalizedUserRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}

function normalizeRole(role: string): string {
  return role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}
