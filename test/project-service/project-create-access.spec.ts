import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectStatus, UserStatus } from '@prisma/client';
import { ProjectsGatewayController } from '../../apps/api-gateway/src/controllers/projects-gateway.controller';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ProjectAccessService } from '../../apps/project-service/src/project-access.service';
import { ProjectController } from '../../apps/project-service/src/project.controller';
import { ProjectService } from '../../apps/project-service/src/project.service';
import { ProjectLifecycleService } from '../../apps/project-service/src/lifecycle/project-lifecycle.service';
import { ProjectRepository } from '../../apps/project-service/src/repositories/project.repository';

describe('Create project access', () => {
  const dto = {
    projectName: 'House Project',
    startDate: '2026-10-01T00:00:00.000Z',
    projectManagerId: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  };
  const actorId = '0bf3b9dd-ce36-480a-8bc8-a5a28dde483c';
  const repository = {
    findUserWithRole: jest.fn(),
    findProjectManagerCandidate: jest.fn(),
    create: jest.fn(),
  };
  let controller: ProjectController;

  beforeEach(() => {
    jest.resetAllMocks();
    const projects = repository as unknown as ProjectRepository;
    controller = new ProjectController(
      new ProjectService(
        projects,
        new ProjectAccessService(projects),
        {} as ProjectLifecycleService,
      ),
    );
    repository.findUserWithRole.mockResolvedValue({
      id: actorId,
      status: UserStatus.ACTIVE,
      role: { roleName: 'ADMIN' },
    });
  });

  it.each(['PROJECT_MANAGER', 'ADMIN'])(
    'allows an admin to create a project assigned to an active %s',
    async (roleName) => {
      repository.findProjectManagerCandidate.mockResolvedValue({
        id: dto.projectManagerId,
        status: UserStatus.ACTIVE,
        role: { roleName },
      });
      repository.create.mockResolvedValue({
        ...dto,
        status: ProjectStatus.PLANNING,
      });

      await expect(controller.create(dto, actorId)).resolves.toMatchObject({
        projectManagerId: dto.projectManagerId,
        status: ProjectStatus.PLANNING,
      });
      expect(repository.findUserWithRole).toHaveBeenCalledWith(actorId);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectManagerId: dto.projectManagerId,
          status: ProjectStatus.PLANNING,
        }),
      );
    },
  );

  it.each([
    ['PROJECT_MANAGER', UserStatus.ACTIVE, 'PROJECT_CREATION_FORBIDDEN'],
    ['ACCOUNTANT', UserStatus.ACTIVE, 'PROJECT_CREATION_FORBIDDEN'],
    ['SALES_MANAGER', UserStatus.ACTIVE, 'PROJECT_ACCESS_DENIED'],
    [null, UserStatus.ACTIVE, 'PROJECT_ACCESS_DENIED'],
    ['ADMIN', UserStatus.INACTIVE, 'PROJECT_ACTOR_INACTIVE'],
  ])(
    'rejects creator role %s with status %s',
    async (roleName, status, code) => {
      repository.findUserWithRole.mockResolvedValue({
        id: actorId,
        status,
        role: roleName ? { roleName } : null,
      });
      await expect(controller.create(dto, actorId)).rejects.toMatchObject({
        response: { code },
      });
      expect(repository.findProjectManagerCandidate).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [undefined, 'PROJECT_ACTOR_REQUIRED'],
    [actorId, 'PROJECT_ACTOR_NOT_FOUND'],
  ])('rejects an unresolved creator %s', async (id, code) => {
    repository.findUserWithRole.mockResolvedValue(null);
    await expect(controller.create(dto, id)).rejects.toMatchObject({
      response: { code },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    'ADMIN',
    'PROJECT_MANAGER',
    'ACCOUNTANT',
    'SALES_MANAGER',
    undefined,
  ])('enforces gateway creation access for %s', (role) => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      ProjectsGatewayController.prototype,
      'create',
    )?.value;

    if (typeof handler !== 'function') {
      throw new Error('Project creation handler not found.');
    }

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
      getHandler: () => handler,
      getClass: () => ProjectsGatewayController,
    } as unknown as ExecutionContext;
    const guard = new RolesGuard(new Reflector());
    if (role === 'ADMIN') expect(guard.canActivate(context)).toBe(true);
    else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
