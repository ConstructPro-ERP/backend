// File: `backend/apps/api-gateway/src/guards/roles.guard.ts`
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../../../../shared/error-codes';
import { ROLES_KEY } from '../decorators/roles.decorator';

type AuthenticatedUser = {
  id?: unknown;
  roleId?: unknown;
  role?: unknown;
  roles?: unknown;
};

type AuthRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'User not available for role check.',
      });
    }

    /*
     * JwtAuthGuard calls Auth Service /auth/me and attaches its response to req.user.
     * Therefore, this guard should read role/roles from req.user.
     * It should not query Prisma again.
     */
    const userRoles = this.extractRoles(user);

    if (userRoles.length === 0) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message:
          'User role not available for role check. Check Auth Service /auth/me response.',
      });
    }

    const normalizedRequiredRoles = requiredRoles.map(normalizeRole);
    const normalizedUserRoles = userRoles.map(normalizeRole);

    const hasRole = normalizedUserRoles.some((role) =>
      normalizedRequiredRoles.includes(role),
    );

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_ROLE,
        message: 'Insufficient role.',
      });
    }

    return true;
  }

  private extractRoles(user: AuthenticatedUser): string[] {
    const roles: string[] = [];

    if (typeof user.role === 'string') {
      roles.push(user.role);
    }

    if (Array.isArray(user.roles)) {
      for (const role of user.roles) {
        if (typeof role === 'string') {
          roles.push(role);
        }
      }
    }

    /*
     * Some responses may come as:
     * { data: { role: 'ADMIN', roles: ['ADMIN'] } }
     * This fallback protects the guard if a response interceptor wraps /auth/me.
     */
    const maybeWrappedUser = user as AuthenticatedUser & {
      data?: AuthenticatedUser;
    };

    if (maybeWrappedUser.data) {
      if (typeof maybeWrappedUser.data.role === 'string') {
        roles.push(maybeWrappedUser.data.role);
      }

      if (Array.isArray(maybeWrappedUser.data.roles)) {
        for (const role of maybeWrappedUser.data.roles) {
          if (typeof role === 'string') {
            roles.push(role);
          }
        }
      }
    }

    return [...new Set(roles)];
  }
}

function normalizeRole(role: string): string {
  return role
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}