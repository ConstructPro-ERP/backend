import { HttpService } from '@nestjs/axios';
import {
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
import { MilestonesGatewayController } from './milestones-gateway.controller';

const PROJECT_ID = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const MILESTONE_ID = '91f8b861-8fc8-4f1a-90e1-4c48e238ff41';
const ACTOR_ID = 'c45c5ef7-6b73-4d24-9da6-69c32cbd1c80';
const SERVICE_URL = 'http://project-service.test';
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

describe('MilestonesGatewayController', () => {
  let app: INestApplication;
  let server: Server;
  let actorRole = 'PROJECT_MANAGER';

  const originalServiceUrl = process.env.PROJECT_SERVICE_URL;

  beforeAll(async () => {
    process.env.PROJECT_SERVICE_URL = SERVICE_URL;

    const moduleRef = await Test.createTestingModule({
      controllers: [MilestonesGatewayController],
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

    const response = of({
      data: { id: MILESTONE_ID },
    });

    mockHttp.get.mockReturnValue(response);
    mockHttp.post.mockReturnValue(response);
    mockHttp.patch.mockReturnValue(response);
    mockHttp.delete.mockReturnValue(response);
  });

  afterAll(async () => {
    await app.close();

    if (originalServiceUrl === undefined) {
      delete process.env.PROJECT_SERVICE_URL;
    } else {
      process.env.PROJECT_SERVICE_URL = originalServiceUrl;
    }
  });

  it('creates a milestone with the authenticated actor ID', async () => {
    await request(server)
      .post(`/api/projects/${PROJECT_ID}/milestones`)
      .set('authorization', AUTHORIZATION)
      .set('x-user-id', 'spoofed-user-id')
      .send({ milestoneName: 'Foundation', weight: 5 })
      .expect(201);

    expect(mockHttp.post).toHaveBeenCalledWith(
      `${SERVICE_URL}/projects/${PROJECT_ID}/milestones`,
      { milestoneName: 'Foundation', weight: 5 },
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('allows an accountant to list project milestones', async () => {
    actorRole = 'ACCOUNTANT';

    await request(server)
      .get(`/api/projects/${PROJECT_ID}/milestones`)
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(mockHttp.get).toHaveBeenCalledWith(
      `${SERVICE_URL}/projects/${PROJECT_ID}/milestones`,
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('retrieves a milestone by ID', async () => {
    await request(server)
      .get(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(mockHttp.get).toHaveBeenCalledWith(
      `${SERVICE_URL}/milestones/${MILESTONE_ID}`,
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('forwards milestone metadata updates', async () => {
    await request(server)
      .patch(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .send({ weight: 7 })
      .expect(200);

    expect(mockHttp.patch).toHaveBeenCalledWith(
      `${SERVICE_URL}/milestones/${MILESTONE_ID}`,
      { weight: 7 },
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('forwards milestone progress updates', async () => {
    await request(server)
      .patch(`/api/milestones/${MILESTONE_ID}/progress`)
      .set('authorization', AUTHORIZATION)
      .send({ progressPercentage: 75 })
      .expect(200);

    expect(mockHttp.patch).toHaveBeenCalledWith(
      `${SERVICE_URL}/milestones/${MILESTONE_ID}/progress`,
      { progressPercentage: 75 },
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('forwards milestone deletion', async () => {
    actorRole = 'ADMIN';

    await request(server)
      .delete(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(200);

    expect(mockHttp.delete).toHaveBeenCalledWith(
      `${SERVICE_URL}/milestones/${MILESTONE_ID}`,
      {
        headers: {
          authorization: AUTHORIZATION,
          'x-user-id': ACTOR_ID,
        },
      },
    );
  });

  it('rejects accountants creating milestones', async () => {
    actorRole = 'ACCOUNTANT';

    await request(server)
      .post(`/api/projects/${PROJECT_ID}/milestones`)
      .set('authorization', AUTHORIZATION)
      .send({ milestoneName: 'Foundation', weight: 5 })
      .expect(403);

    expect(mockHttp.post).not.toHaveBeenCalled();
  });

  it('rejects accountants updating progress', async () => {
    actorRole = 'ACCOUNTANT';

    await request(server)
      .patch(`/api/milestones/${MILESTONE_ID}/progress`)
      .set('authorization', AUTHORIZATION)
      .send({ progressPercentage: 50 })
      .expect(403);

    expect(mockHttp.patch).not.toHaveBeenCalled();
  });

  it('rejects sales managers reading milestones', async () => {
    actorRole = 'SALES_MANAGER';

    await request(server)
      .get(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(403);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid milestone UUIDs', async () => {
    await request(server)
      .get('/api/milestones/invalid-id')
      .set('authorization', AUTHORIZATION)
      .expect(400);

    expect(mockHttp.get).not.toHaveBeenCalled();
  });

  it('rejects invalid milestone creation data', async () => {
    await request(server)
      .post(`/api/projects/${PROJECT_ID}/milestones`)
      .set('authorization', AUTHORIZATION)
      .send({ milestoneName: 'Foundation', weight: 11 })
      .expect(400);

    expect(mockHttp.post).not.toHaveBeenCalled();
  });

  it('preserves downstream 404 errors', async () => {
    mockHttp.get.mockReturnValue(
      throwError(() => ({
        response: {
          status: 404,
          data: {
            code: 'MILESTONE_NOT_FOUND',
            message: 'Milestone not found.',
          },
        },
      })),
    );

    const response = await request(server)
      .get(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(404);

    expect(response.text).toContain('MILESTONE_NOT_FOUND');
  });

  it('returns 502 when Project Service is unavailable', async () => {
    mockHttp.get.mockReturnValue(
      throwError(() => new Error('Connection refused')),
    );

    const response = await request(server)
      .get(`/api/milestones/${MILESTONE_ID}`)
      .set('authorization', AUTHORIZATION)
      .expect(502);

    expect(response.text).toContain('PROJECT_SERVICE_UNAVAILABLE');
  });
});
