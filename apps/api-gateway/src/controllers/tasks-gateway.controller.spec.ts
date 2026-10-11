import { HttpService } from '@nestjs/axios';
import {
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import type { Server } from 'node:http';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TasksGatewayController } from './tasks-gateway.controller';

const PROJECT_ID = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const TASK_ID = '91f8b861-8fc8-4f1a-90e1-4c48e238ff41';
const ACTOR_ID = 'c45c5ef7-6b73-4d24-9da6-69c32cbd1c80';
const ASSIGNEE_ID = 'f5ff5c48-922c-4f43-b49b-9330f422d041';
const SERVICE_URL = 'http://task-service.test';
const AUTHORIZATION = 'Bearer test-token';

interface AuthenticatedTestRequest extends Request {
  user?: {
    id?: string;
    role?: string;
  };
}

const mockHttp = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};

describe('TasksGatewayController', () => {
  let app: INestApplication;
  let server: Server;
  let actorRole = 'PROJECT_MANAGER';
  let authenticated = true;

  const originalServiceUrl = process.env.TASK_SERVICE_URL;

  const expectedHeaders = {
    authorization: AUTHORIZATION,
    'x-user-id': ACTOR_ID,
  };

  beforeAll(async () => {
    process.env.TASK_SERVICE_URL = SERVICE_URL;

    const moduleRef = await Test.createTestingModule({
      controllers: [TasksGatewayController],
      providers: [
        {
          provide: HttpService,
          useValue: mockHttp,
        },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          if (!authenticated) {
            throw new UnauthorizedException('Authentication required');
          }

          const req = context
            .switchToHttp()
            .getRequest<AuthenticatedTestRequest>();

          req.user = {
            id: ACTOR_ID,
            role: actorRole,
          };

          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();

    app.setGlobalPrefix('api');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    actorRole = 'PROJECT_MANAGER';
    authenticated = true;

    const response = of({
      data: { id: TASK_ID },
    });

    mockHttp.get.mockReturnValue(response);
    mockHttp.post.mockReturnValue(response);
    mockHttp.patch.mockReturnValue(response);
    mockHttp.delete.mockReturnValue(response);
  });

  afterAll(async () => {
    await app.close();

    if (originalServiceUrl === undefined) {
      delete process.env.TASK_SERVICE_URL;
    } else {
      process.env.TASK_SERVICE_URL = originalServiceUrl;
    }
  });

  it('creates a task using the authenticated actor ID', async () => {
    const body = {
      projectId: PROJECT_ID,
      taskName: 'Prepare materials',
    };

    await request(server)
      .post('/api/tasks')
      .set('authorization', AUTHORIZATION)
      .set('x-user-id', 'spoofed-user-id')
      .send(body)
      .expect(201);

    expect(mockHttp.post).toHaveBeenCalledWith(`${SERVICE_URL}/tasks`, body, {
      headers: expectedHeaders,
    });
  });

  it('forwards list filters and pagination', async () => {
    await request(server)
      .get('/api/tasks')
      .set('authorization', AUTHORIZATION)
      .query({
        projectId: PROJECT_ID,
        milestoneId: TASK_ID,
        status: 'BLOCKED',
        page: 2,
        limit: 5,
        sortBy: 'dueDate',
        sortOrder: 'asc',
      })
      .expect(200);

    expect(mockHttp.get.mock.calls).toMatchObject([
      [
        `${SERVICE_URL}/tasks`,
        {
          headers: expectedHeaders,
          params: {
            projectId: PROJECT_ID,
            milestoneId: TASK_ID,
            status: 'BLOCKED',
            page: 2,
            limit: 5,
            sortBy: 'dueDate',
            sortOrder: 'asc',
          },
        },
      ],
    ]);
  });

  it('forwards project-scoped task queries', async () => {
    await request(server)
      .get(`/api/projects/${PROJECT_ID}/tasks`)
      .set('authorization', AUTHORIZATION)
      .query({ status: 'TODO', page: 1 })
      .expect(200);

    expect(mockHttp.get.mock.calls).toMatchObject([
      [
        `${SERVICE_URL}/projects/${PROJECT_ID}/tasks`,
        {
          headers: expectedHeaders,
          params: {
            status: 'TODO',
            page: 1,
          },
        },
      ],
    ]);
  });

  it('allows accountants to read tasks', async () => {
    actorRole = 'ACCOUNTANT';

    await request(server)
      .get(`/api/tasks/${TASK_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(mockHttp.get).toHaveBeenCalledWith(
      `${SERVICE_URL}/tasks/${TASK_ID}`,
      { headers: expectedHeaders },
    );
  });

  it('forwards task metadata updates', async () => {
    const body = { taskName: 'Updated foundation task' };

    await request(server)
      .patch(`/api/tasks/${TASK_ID}`)
      .set('authorization', AUTHORIZATION)
      .send(body)
      .expect(200);

    expect(mockHttp.patch).toHaveBeenCalledWith(
      `${SERVICE_URL}/tasks/${TASK_ID}`,
      body,
      { headers: expectedHeaders },
    );
  });

  it('forwards task status updates', async () => {
    const body = { status: 'COMPLETED' };

    await request(server)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('authorization', AUTHORIZATION)
      .send(body)
      .expect(200);

    expect(mockHttp.patch).toHaveBeenCalledWith(
      `${SERVICE_URL}/tasks/${TASK_ID}/status`,
      body,
      { headers: expectedHeaders },
    );
  });

  it('forwards task assignments', async () => {
    const body = { assignedToId: ASSIGNEE_ID };

    await request(server)
      .patch(`/api/tasks/${TASK_ID}/assign`)
      .set('authorization', AUTHORIZATION)
      .send(body)
      .expect(200);

    expect(mockHttp.patch).toHaveBeenCalledWith(
      `${SERVICE_URL}/tasks/${TASK_ID}/assign`,
      body,
      { headers: expectedHeaders },
    );
  });

  it('forwards task deletion', async () => {
    actorRole = 'ADMIN';

    await request(server)
      .delete(`/api/tasks/${TASK_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(mockHttp.delete).toHaveBeenCalledWith(
      `${SERVICE_URL}/tasks/${TASK_ID}`,
      { headers: expectedHeaders },
    );
  });

  it('rejects requests denied by authentication', async () => {
    authenticated = false;

    await request(server).get('/api/tasks').expect(401);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it.each([
    ['post', '/api/tasks'],
    ['patch', `/api/tasks/${TASK_ID}`],
    ['patch', `/api/tasks/${TASK_ID}/status`],
    ['patch', `/api/tasks/${TASK_ID}/assign`],
    ['delete', `/api/tasks/${TASK_ID}`],
  ])('denies accountants using %s %s', async (method, path) => {
    actorRole = 'ACCOUNTANT';

    if (method === 'post') {
      await request(server)
        .post(path)
        .set('authorization', AUTHORIZATION)
        .send({
          projectId: PROJECT_ID,
          taskName: 'Unauthorized task',
        })
        .expect(403);
    } else if (method === 'patch') {
      await request(server)
        .patch(path)
        .set('authorization', AUTHORIZATION)
        .send({ taskName: 'Unauthorized task' })
        .expect(403);
    } else {
      await request(server)
        .delete(path)
        .set('authorization', AUTHORIZATION)
        .expect(403);
    }

    expect(mockHttp.post).not.toHaveBeenCalled();
    expect(mockHttp.patch).not.toHaveBeenCalled();
    expect(mockHttp.delete).not.toHaveBeenCalled();
  });

  it('denies unsupported roles reading tasks', async () => {
    actorRole = 'SALES_MANAGER';

    await request(server)
      .get('/api/tasks')
      .set('authorization', AUTHORIZATION)
      .expect(403);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid task identifiers', async () => {
    await request(server)
      .get('/api/tasks/invalid-id')
      .set('authorization', AUTHORIZATION)
      .expect(400);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid project identifiers', async () => {
    await request(server)
      .get('/api/projects/invalid-id/tasks')
      .set('authorization', AUTHORIZATION)
      .expect(400);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination', async () => {
    await request(server)
      .get('/api/tasks')
      .set('authorization', AUTHORIZATION)
      .query({ page: 0, limit: 101 })
      .expect(400);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid task status values', async () => {
    await request(server)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('authorization', AUTHORIZATION)
      .send({ status: 'DELAYED' })
      .expect(400);

    expect(mockHttp.patch).not.toHaveBeenCalled();
  });

  it('preserves downstream task-not-found errors', async () => {
    mockHttp.get.mockReturnValue(
      throwError(() => ({
        response: {
          status: 404,
          data: {
            code: 'TASK_NOT_FOUND',
            message: 'Task not found.',
          },
        },
      })),
    );

    const response = await request(server)
      .get(`/api/tasks/${TASK_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(404);

    expect(response.text).toContain('TASK_NOT_FOUND');
  });

  it('preserves downstream concurrency errors', async () => {
    mockHttp.patch.mockReturnValue(
      throwError(() => ({
        response: {
          status: 409,
          data: {
            code: 'TASK_CONCURRENCY_CONFLICT',
            message: 'Task data changed concurrently.',
          },
        },
      })),
    );

    const response = await request(server)
      .patch(`/api/tasks/${TASK_ID}/status`)
      .set('authorization', AUTHORIZATION)
      .send({ status: 'COMPLETED' })
      .expect(409);

    expect(response.text).toContain('TASK_CONCURRENCY_CONFLICT');
  });

  it('returns 502 when Task Service is unavailable', async () => {
    mockHttp.get.mockReturnValue(
      throwError(() => new Error('Connection refused')),
    );

    const response = await request(server)
      .get(`/api/tasks/${TASK_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(502);

    expect(response.text).toContain('TASK_SERVICE_UNAVAILABLE');
  });
});
