import { HttpService } from '@nestjs/axios';
import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectStatus } from '@prisma/client';
import type { Request } from 'express';
import { of, throwError } from 'rxjs';
import type { AssignProjectManagerDto } from '../../../project-service/src/dto/assign-project-manager.dto';
import type { CreateProjectDto } from '../../../project-service/src/dto/create-project.dto';
import { ProjectQueryDto } from '../../../project-service/src/dto/project-query.dto';
import type { UpdateProjectStatusDto } from '../../../project-service/src/dto/project-status.dto';
import type { UpdateProjectDto } from '../../../project-service/src/dto/update-project.dto';
import { RolesGuard } from '../guards/roles.guard';
import { ProjectsGatewayController } from './projects-gateway.controller';

function contextFor(
  role: string | undefined,
  handlerName: keyof ProjectsGatewayController,
): ExecutionContext {
  const handler = ProjectsGatewayController.prototype[handlerName];

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { role } : undefined,
      }),
    }),
    getHandler: () => handler as unknown as () => void,
    getClass: () => ProjectsGatewayController,
  } as unknown as ExecutionContext;
}

type AuthenticatedTestRequest = Request & {
  user?: {
    id?: string;
    sub?: string;
  };
};

function reqWith(
  overrides: Partial<AuthenticatedTestRequest> = {},
): AuthenticatedTestRequest {
  return {
    headers: {
      authorization: 'Bearer test-token',
    },
    user: {
      id: 'user-1',
    },
    ...overrides,
  } as AuthenticatedTestRequest;
}

describe('ProjectsGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'])(
    'allows %s to read projects',
    (role) => {
      expect(guard.canActivate(contextFor(role, 'findAll'))).toBe(true);
    },
  );

  it('rejects Sales Manager from general project routes', () => {
    expect(() =>
      guard.canActivate(contextFor('SALES_MANAGER', 'findAll')),
    ).toThrow(ForbiddenException);
  });

  it('rejects Client Portal User from general project routes', () => {
    expect(() =>
      guard.canActivate(contextFor('CLIENT_PORTAL_USER', 'findAll')),
    ).toThrow(ForbiddenException);
  });

  it('allows Admin to create and update projects', () => {
    expect(guard.canActivate(contextFor('ADMIN', 'create'))).toBe(true);
    expect(guard.canActivate(contextFor('ADMIN', 'update'))).toBe(true);
    expect(guard.canActivate(contextFor('ADMIN', 'updateStatus'))).toBe(true);
  });

  it('rejects Project Manager from write routes until assigned-project authorization is implemented', () => {
    expect(() =>
      guard.canActivate(contextFor('PROJECT_MANAGER', 'update')),
    ).toThrow(ForbiddenException);
  });

  it('allows only Admin to assign a project manager', () => {
    expect(guard.canActivate(contextFor('ADMIN', 'assignManager'))).toBe(true);

    expect(() =>
      guard.canActivate(contextFor('PROJECT_MANAGER', 'assignManager')),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => guard.canActivate(contextFor(undefined, 'findAll'))).toThrow(
      ForbiddenException,
    );
  });
});

describe('ProjectsGatewayController', () => {
  let controller: ProjectsGatewayController;

  let httpService: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
  };

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsGatewayController],
      providers: [
        {
          provide: HttpService,
          useValue: httpService,
        },
      ],
    }).compile();

    controller = module.get<ProjectsGatewayController>(
      ProjectsGatewayController,
    );

    process.env.PROJECT_SERVICE_URL = 'http://project-service.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.PROJECT_SERVICE_URL;
  });

  it('forwards create() to POST /projects with auth and actor headers', async () => {
    httpService.post.mockReturnValue(
      of({
        data: {
          id: 'project-1',
        },
      }),
    );

    const req = reqWith();

    const body: CreateProjectDto = {
      projectName: 'Kandy Residence',
      startDate: '2026-10-01T00:00:00.000Z',
      projectManagerId: '00000000-0000-4000-8000-000000000001',
    };

    const result = await controller.create(body, req);

    expect(httpService.post).toHaveBeenCalledWith(
      'http://project-service.test/projects',
      body,
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
      },
    );

    expect(result).toEqual({
      id: 'project-1',
    });
  });

  it('forwards findAll() query params to GET /projects', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          data: [],
          meta: {},
        },
      }),
    );

    const req = reqWith();

    const query = new ProjectQueryDto();
    query.search = 'Kandy';
    query.page = 2;
    query.limit = 20;

    const result = await controller.findAll(query, req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://project-service.test/projects',
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
        params: query,
      },
    );

    expect(result).toEqual({
      data: [],
      meta: {},
    });
  });

  it('forwards findOne() to GET /projects/:id', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          id: 'project-1',
        },
      }),
    );

    const req = reqWith();

    await controller.findOne('project-1', req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://project-service.test/projects/project-1',
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
      },
    );
  });

  it('forwards update() to PATCH /projects/:id', async () => {
    httpService.patch.mockReturnValue(
      of({
        data: {
          id: 'project-1',
        },
      }),
    );

    const req = reqWith();

    const body: UpdateProjectDto = {
      location: 'Colombo',
    };

    await controller.update('project-1', body, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://project-service.test/projects/project-1',
      body,
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
      },
    );
  });

  it('forwards updateStatus() to PATCH /projects/:id/status', async () => {
    httpService.patch.mockReturnValue(
      of({
        data: {
          id: 'project-1',
        },
      }),
    );

    const req = reqWith();

    const body: UpdateProjectStatusDto = {
      status: ProjectStatus.ON_HOLD,
    };

    await controller.updateStatus('project-1', body, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://project-service.test/projects/project-1/status',
      body,
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
      },
    );
  });

  it('forwards assignManager() to PATCH /projects/:id/manager', async () => {
    httpService.patch.mockReturnValue(
      of({
        data: {
          id: 'project-1',
        },
      }),
    );

    const req = reqWith();

    const body: AssignProjectManagerDto = {
      projectManagerId: '00000000-0000-4000-8000-000000000001',
    };

    await controller.assignManager('project-1', body, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://project-service.test/projects/project-1/manager',
      body,
      {
        headers: {
          authorization: 'Bearer test-token',
          'x-user-id': 'user-1',
        },
      },
    );
  });

  it('preserves downstream project-service errors', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: {
          status: 404,
          data: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found',
          },
        },
      })),
    );

    const req = reqWith();

    await expect(controller.findOne('missing-id', req)).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      },
    });
  });

  it('returns 502 when project-service is unreachable', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('service unavailable')),
    );

    const req = reqWith();

    await expect(controller.findOne('project-1', req)).rejects.toBeInstanceOf(
      HttpException,
    );

    await expect(controller.findOne('project-1', req)).rejects.toMatchObject({
      status: 502,
      response: {
        code: 'PROJECT_SERVICE_UNAVAILABLE',
        message: 'Project service is unreachable.',
      },
    });
  });
});
