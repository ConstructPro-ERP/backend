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
import { prisma } from '../../../../libs/database/src';
export { DatabaseModule } from '../../../../libs/database/src/database.module';

type AuthenticatedUser = { roles?: unknown; role?: unknown };
type AuthRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const role = await prisma.role.findUnique({
      where: {
        id: String(user.roleId),
      },
    });

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    const hasRole = requiredRoles.includes(role.roleName);

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
