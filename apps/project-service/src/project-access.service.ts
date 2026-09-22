import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import {
  ProjectAccessActor,
  ProjectAccessResource,
} from './interfaces/project-access.interface';
import { ProjectRepository } from './repositories/project.repository';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly projects: ProjectRepository) {}

  async resolveActor(actorId?: string): Promise<ProjectAccessActor> {
    if (!actorId) {
      throw new UnauthorizedException({
        code: ErrorCode.PROJECT_ACTOR_REQUIRED,
        message: 'Authenticated user information is required.',
      });
    }

    const user = await this.projects.findUserWithRole(actorId);

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

    const roleName = user.role?.roleName;

    if (!roleName || !this.isProjectAccessRole(roleName)) {
      throw new ForbiddenException({
        code: ErrorCode.PROJECT_ACCESS_DENIED,
        message: 'You do not have permission to access project operations.',
      });
    }

    return {
      id: user.id,
      role: roleName,
    };
  }

  assertCanReadProject(
    actor: ProjectAccessActor,
    project: ProjectAccessResource,
  ): void {
    if (actor.role !== 'PROJECT_MANAGER') {
      return;
    }

    if (project.projectManagerId === actor.id) {
      return;
    }

    this.throwProjectAccessDenied(project.id);
  }

  assertCanModifyProject(
    actor: ProjectAccessActor,
    project: ProjectAccessResource,
  ): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (
      actor.role === 'PROJECT_MANAGER' &&
      project.projectManagerId === actor.id
    ) {
      return;
    }

    this.throwProjectAccessDenied(project.id);
  }

  assertCanCreateProject(actor: ProjectAccessActor): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    throw new ForbiddenException({
      code: ErrorCode.PROJECT_CREATION_FORBIDDEN,
      message: 'Only an administrator can create a standalone project.',
    });
  }

  assertCanAssignProjectManager(actor: ProjectAccessActor): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    throw new ForbiddenException({
      code: ErrorCode.PROJECT_MANAGER_ASSIGNMENT_FORBIDDEN,
      message: 'Only an administrator can assign a project manager.',
    });
  }

  private isProjectAccessRole(
    roleName: string,
  ): roleName is ProjectAccessActor['role'] {
    return (
      roleName === 'ADMIN' ||
      roleName === 'PROJECT_MANAGER' ||
      roleName === 'ACCOUNTANT'
    );
  }

  private throwProjectAccessDenied(projectId: string): never {
    throw new ForbiddenException({
      code: ErrorCode.PROJECT_ACCESS_DENIED,
      message: 'You do not have permission to access this project.',
      details: {
        projectId,
      },
    });
  }
}
