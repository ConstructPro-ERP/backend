import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  assertCanModifyProject,
  assertCanReadProject,
  requireProjectActorId,
  resolveProjectActor,
  type ProjectAccessActor,
  type ProjectAccessResource,
} from '../../../libs/common/src/project-access/project-access.policy';
import { ErrorCode } from '../../../shared/error-codes';
import { ProjectRepository } from './repositories/project.repository';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly projects: ProjectRepository) {}

  async resolveActor(actorId?: string): Promise<ProjectAccessActor> {
    const id = requireProjectActorId(actorId);
    const user = await this.projects.findUserWithRole(id);
    return resolveProjectActor(user);
  }

  assertCanReadProject(
    actor: ProjectAccessActor,
    project: ProjectAccessResource,
  ): void {
    assertCanReadProject(actor, project);
  }

  assertCanModifyProject(
    actor: ProjectAccessActor,
    project: ProjectAccessResource,
  ): void {
    assertCanModifyProject(actor, project);
  }

  assertCanCreateProject(actor: ProjectAccessActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: ErrorCode.PROJECT_CREATION_FORBIDDEN,
        message: 'Only an administrator can create a standalone project.',
      });
    }
  }

  assertCanAssignProjectManager(actor: ProjectAccessActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: ErrorCode.PROJECT_MANAGER_ASSIGNMENT_FORBIDDEN,
        message: 'Only an administrator can assign a project manager.',
      });
    }
  }

  assertCanDeleteProject(actor: ProjectAccessActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: ErrorCode.PROJECT_DELETION_FORBIDDEN,
        message: 'Only an administrator can permanently delete a project.',
      });
    }
  }
}
