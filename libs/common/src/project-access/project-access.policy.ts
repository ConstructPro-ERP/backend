import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ErrorCode } from '../../../../shared/error-codes';

export interface ProjectAccessActor {
  id: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'ACCOUNTANT';
}

export interface ProjectAccessResource {
  id: string;
  projectManagerId: string;
}

export interface ProjectAccessUser {
  id: string;
  status: UserStatus;
  role: { roleName: string } | null;
}

export function requireProjectActorId(actorId?: string): string {
  if (!actorId) {
    throw new UnauthorizedException({
      code: ErrorCode.PROJECT_ACTOR_REQUIRED,
      message: 'Authenticated user information is required.',
    });
  }

  return actorId;
}

export function resolveProjectActor(
  user: ProjectAccessUser | null,
): ProjectAccessActor {
  if (!user) {
    throw new UnauthorizedException({
      code: ErrorCode.PROJECT_ACTOR_NOT_FOUND,
      message: 'Authenticated user could not be resolved.',
    });
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new ForbiddenException({
      code: ErrorCode.PROJECT_ACTOR_INACTIVE,
      message: 'Inactive users cannot access project operations.',
    });
  }

  const role = user.role?.roleName;

  if (role === 'ADMIN' || role === 'PROJECT_MANAGER' || role === 'ACCOUNTANT') {
    return { id: user.id, role };
  }

  throw new ForbiddenException({
    code: ErrorCode.PROJECT_ACCESS_DENIED,
    message: 'You do not have permission to access project operations.',
  });
}

export function assertCanReadProject(
  actor: ProjectAccessActor,
  project: ProjectAccessResource,
): void {
  if (
    actor.role === 'ADMIN' ||
    actor.role === 'ACCOUNTANT' ||
    (actor.role === 'PROJECT_MANAGER' && project.projectManagerId === actor.id)
  ) {
    return;
  }

  throwProjectAccessDenied(project.id);
}

export function assertCanModifyProject(
  actor: ProjectAccessActor,
  project: ProjectAccessResource,
): void {
  if (
    actor.role === 'ADMIN' ||
    (actor.role === 'PROJECT_MANAGER' && project.projectManagerId === actor.id)
  ) {
    return;
  }

  throwProjectAccessDenied(project.id);
}

function throwProjectAccessDenied(projectId: string): never {
  throw new ForbiddenException({
    code: ErrorCode.PROJECT_ACCESS_DENIED,
    message: 'You do not have permission to access this project.',
    details: { projectId },
  });
}
