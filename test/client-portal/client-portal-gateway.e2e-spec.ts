import { HttpModule } from '@nestjs/axios';
import {
  ForbiddenException,
  INestApplication,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { ClientPortalGatewayController } from '../../apps/api-gateway/src/controllers/client-portal-gateway.controller';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';
import { ClientPortalController } from '../../apps/client-service/src/client-portal.controller';
import { ClientPortalReadService } from '../../apps/client-service/src/client-portal-read.service';
import { ErrorCode } from '../../shared/error-codes';

const projectId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const documentId = 'f5ff5c48-922c-4f43-b49b-9330f422d041';

const actors: Record<string, { id: string; role: string }> = {
  client: { id: 'verified-client', role: 'CLIENT_PORTAL_USER' },
  admin: { id: 'verified-admin', role: 'ADMIN' },
  accountant: { id: 'verified-accountant', role: 'ACCOUNTANT' },
};

const mockPortal = {
  findProjects: jest.fn(),
  findProject: jest.fn(),
  findMilestones: jest.fn(),
  findDocuments: jest.fn(),
  findQuotations: jest.fn(),
};

interface GatewayPage<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

describe('Client Portal — Gateway E2E', () => {
  let clientApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayServer: Server;
  let authServer: Server;

  const originalClientUrl = process.env.CLIENT_SERVICE_URL;
  const originalAuthUrl = process.env.AUTH_SERVICE_URL;

  const token = (role: string): string => `Bearer ${role}`;

  beforeAll(async () => {
    // Downstream service with mocked business logic.
    const clientModule = await Test.createTestingModule({
      controllers: [ClientPortalController],
      providers: [
        {
          provide: ClientPortalReadService,
          useValue: mockPortal,
        },
      ],
    }).compile();

    clientApp = clientModule.createNestApplication();

    clientApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await clientApp.listen(0, '127.0.0.1');
    process.env.CLIENT_SERVICE_URL = await clientApp.getUrl();

    // Mock Auth Service /auth/me endpoint.
    authServer = createServer((req, res) => {
      if (req.url !== '/auth/me') {
        res.writeHead(404);
        res.end();
        return;
      }

      const label = (req.headers.authorization ?? '').replace(/^Bearer /, '');

      const actor = actors[label];

      if (!actor) {
        res.writeHead(401, {
          'content-type': 'application/json',
        });
        res.end(JSON.stringify({ code: ErrorCode.TOKEN_INVALID }));
        return;
      }

      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(JSON.stringify(actor));
    });

    await new Promise<void>((resolve) => {
      authServer.listen(0, '127.0.0.1', resolve);
    });

    const address = authServer.address();

    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve Auth Service test port.');
    }

    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    // Real Gateway guards, controller and response handling.
    const gatewayModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [ClientPortalGatewayController],
      providers: [JwtAuthGuard, RolesGuard, Reflector],
    }).compile();

    gatewayApp = gatewayModule.createNestApplication();
    gatewayApp.useLogger(['log', 'warn']);
    gatewayApp.setGlobalPrefix('api');

    gatewayApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    gatewayApp.useGlobalInterceptors(new ResponseInterceptor());
    gatewayApp.useGlobalFilters(new HttpExceptionFilter());

    await gatewayApp.init();
    gatewayServer = gatewayApp.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.resetAllMocks();

    // Suppress expected rejection logs in tests only.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    mockPortal.findProjects.mockResolvedValue({
      items: [{ id: projectId }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    mockPortal.findProject.mockResolvedValue({
      id: projectId,
      projectName: 'Client Project',
      progressPercentage: 40,
    });

    mockPortal.findMilestones.mockResolvedValue([
      { id: 'milestone-1', progressPercentage: 50 },
    ]);

    mockPortal.findDocuments.mockResolvedValue({
      items: [{ id: documentId, originalName: 'plan.pdf' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    mockPortal.findQuotations.mockResolvedValue({
      items: [{ id: 'quotation-1', totalAmount: '125000.00' }],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (gatewayApp) await gatewayApp.close();
    if (clientApp) await clientApp.close();

    if (authServer) {
      await new Promise<void>((resolve, reject) => {
        authServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    if (originalClientUrl === undefined) {
      delete process.env.CLIENT_SERVICE_URL;
    } else {
      process.env.CLIENT_SERVICE_URL = originalClientUrl;
    }

    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });

  it('forwards project lists with verified identity and pagination', async () => {
    mockPortal.findProjects.mockResolvedValue({
      items: [{ id: projectId }],
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
    });

    const response = await request(gatewayServer)
      .get('/api/client-portal/projects?page=2&limit=5')
      .set('authorization', token('client'))
      .set('x-user-id', actors.admin.id)
      .expect(200);

    const body = response.body as GatewayPage<{ id: string }>;

    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: projectId }]);
    expect(body.meta).toMatchObject({
      page: 2,
      limit: 5,
      total: 1,
    });

    expect(mockPortal.findProjects).toHaveBeenCalledWith(
      actors.client.id,
      expect.objectContaining({ page: 2, limit: 5 }),
    );
  });

  it('forwards project details with the verified client ID', async () => {
    const response = await request(gatewayServer)
      .get(`/api/client-portal/projects/${projectId}`)
      .set('authorization', token('client'))
      .set('x-user-id', actors.admin.id)
      .expect(200);

    const body = response.body as {
      data: { id: string; progressPercentage: number };
    };

    expect(body.data.id).toBe(projectId);
    expect(body.data.progressPercentage).toBe(40);

    expect(mockPortal.findProject).toHaveBeenCalledWith(
      actors.client.id,
      projectId,
    );
  });

  it('forwards owned project milestone requests', async () => {
    await request(gatewayServer)
      .get(`/api/client-portal/projects/${projectId}/milestones`)
      .set('authorization', token('client'))
      .expect(200);

    expect(mockPortal.findMilestones).toHaveBeenCalledWith(
      actors.client.id,
      projectId,
    );
  });

  it('forwards document lists and pagination', async () => {
    await request(gatewayServer)
      .get(`/api/client-portal/projects/${projectId}/documents?page=1&limit=5`)
      .set('authorization', token('client'))
      .expect(200);

    expect(mockPortal.findDocuments).toHaveBeenCalledWith(
      actors.client.id,
      projectId,
      expect.objectContaining({ page: 1, limit: 5 }),
    );
  });

  it('forwards quotation lists for authenticated clients', async () => {
    const response = await request(gatewayServer)
      .get('/api/client-portal/quotations')
      .set('authorization', token('client'))
      .expect(200);

    const body = response.body as GatewayPage<{
      id: string;
      totalAmount: string;
    }>;

    expect(body.data[0].totalAmount).toBe('125000.00');

    expect(mockPortal.findQuotations).toHaveBeenCalledWith(
      actors.client.id,
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(gatewayServer)
      .get('/api/client-portal/projects')
      .set('x-user-id', actors.client.id)
      .expect(401);

    expect(response.body as unknown).toMatchObject({
      success: false,
      statusCode: 401,
    });

    expect(mockPortal.findProjects).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer tokens', async () => {
    await request(gatewayServer)
      .get('/api/client-portal/projects')
      .set('authorization', token('invalid'))
      .expect(401);

    expect(mockPortal.findProjects).not.toHaveBeenCalled();
  });

  it.each(['admin', 'accountant'])(
    'rejects %s access to client-only routes',
    async (role) => {
      await request(gatewayServer)
        .get('/api/client-portal/projects')
        .set('authorization', token(role))
        .expect(403);

      expect(mockPortal.findProjects).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/api/client-portal/projects/not-a-uuid',
    '/api/client-portal/projects/not-a-uuid/milestones',
    '/api/client-portal/projects/not-a-uuid/documents',
  ])('rejects invalid project identifiers: %s', async (path) => {
    await request(gatewayServer)
      .get(path)
      .set('authorization', token('client'))
      .expect(400);

    expect(mockPortal.findProject).not.toHaveBeenCalled();
    expect(mockPortal.findMilestones).not.toHaveBeenCalled();
    expect(mockPortal.findDocuments).not.toHaveBeenCalled();
  });

  it.each([
    '/api/client-portal/projects?page=0',
    '/api/client-portal/projects?limit=101',
    '/api/client-portal/quotations?limit=0',
    `/api/client-portal/projects/${projectId}/documents?page=invalid`,
  ])('rejects invalid pagination: %s', async (path) => {
    await request(gatewayServer)
      .get(path)
      .set('authorization', token('client'))
      .expect(400);

    expect(mockPortal.findProjects).not.toHaveBeenCalled();
    expect(mockPortal.findQuotations).not.toHaveBeenCalled();
    expect(mockPortal.findDocuments).not.toHaveBeenCalled();
  });

  it('preserves downstream project-not-found errors', async () => {
    mockPortal.findProject.mockRejectedValueOnce(
      new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      }),
    );

    const response = await request(gatewayServer)
      .get(`/api/client-portal/projects/${projectId}`)
      .set('authorization', token('client'))
      .expect(404);

    expect(response.body as unknown).toMatchObject({
      success: false,
      statusCode: 404,
      code: ErrorCode.PROJECT_NOT_FOUND,
    });
  });

  it('preserves downstream unlinked-customer errors', async () => {
    mockPortal.findProjects.mockRejectedValueOnce(
      new ForbiddenException({
        code: ErrorCode.CLIENT_PROFILE_NOT_LINKED,
        message: 'No customer profile is linked to this account.',
      }),
    );

    const response = await request(gatewayServer)
      .get('/api/client-portal/projects')
      .set('authorization', token('client'))
      .expect(403);

    expect(response.body as unknown).toMatchObject({
      success: false,
      statusCode: 403,
      code: ErrorCode.CLIENT_PROFILE_NOT_LINKED,
    });
  });

  it('returns 502 when the downstream Client Service is unreachable', async () => {
    const currentClientUrl = process.env.CLIENT_SERVICE_URL;

    try {
      process.env.CLIENT_SERVICE_URL = 'http://127.0.0.1:1';

      const response = await request(gatewayServer)
        .get('/api/client-portal/projects')
        .set('authorization', token('client'))
        .expect(502);

      expect(response.body as unknown).toMatchObject({
        success: false,
        statusCode: 502,
        code: 'CLIENT_SERVICE_UNAVAILABLE',
      });
    } finally {
      if (currentClientUrl === undefined) {
        delete process.env.CLIENT_SERVICE_URL;
      } else {
        process.env.CLIENT_SERVICE_URL = currentClientUrl;
      }
    }
  });
});
