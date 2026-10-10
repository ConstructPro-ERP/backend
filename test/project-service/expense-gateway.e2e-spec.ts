import { HttpModule } from '@nestjs/axios';
import {
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { ExpensesGatewayController } from '../../apps/api-gateway/src/controllers/expenses-gateway.controller';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';
import { ExpenseController } from '../../apps/project-service/src/expense.controller';
import { ExpenseService } from '../../apps/project-service/src/expense.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(30000);

const projectId = 'b390c2c8-86f5-484f-ad9f-170bca22703d';
const expenseId = 'f5ff5c48-922c-4f43-b49b-9330f422d041';

const validCreate = {
  amount: '12.50',
  category: 'MATERIAL',
  expenseDate: '2026-10-10T00:00:00.000Z',
};

const expense = {
  id: expenseId,
  projectId,
  recordedById: 'accountant-id',
  ...validCreate,
};

const actors: Record<string, { id: string; role: string }> = {
  admin: { id: 'admin-id', role: 'ADMIN' },
  accountant: { id: 'accountant-id', role: 'ACCOUNTANT' },
  manager: { id: 'manager-id', role: 'PROJECT_MANAGER' },
};

const mockExpenses = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  summary: jest.fn(),
};

interface GatewayBody<T> {
  success: boolean;
  data: T;
}

describe('Expenses — Gateway to Project Service E2E', () => {
  let projectApp: INestApplication;
  let gatewayApp: INestApplication;
  let gatewayServer: Server;
  let authServer: Server;

  const originalProjectUrl = process.env.PROJECT_SERVICE_URL;
  const originalAuthUrl = process.env.AUTH_SERVICE_URL;

  const token = (role: string) => `Bearer ${role}`;

  beforeAll(async () => {
    // Real Project Service HTTP controller, mocked business service.
    const projectModule = await Test.createTestingModule({
      controllers: [ExpenseController],
      providers: [
        {
          provide: ExpenseService,
          useValue: mockExpenses,
        },
      ],
    }).compile();

    projectApp = projectModule.createNestApplication();

    projectApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await projectApp.listen(0, '127.0.0.1');
    process.env.PROJECT_SERVICE_URL = await projectApp.getUrl();

    // Only /auth/me is simulated; the gateway guards stay real.
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
        res.end(JSON.stringify({ code: 'TOKEN_INVALID' }));
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
      throw new Error('Unable to resolve Auth Service port.');
    }

    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${address.port}`;

    const gatewayModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [ExpensesGatewayController],
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

    mockExpenses.create.mockResolvedValue(expense);
    mockExpenses.findAll.mockResolvedValue({
      data: [expense],
      meta: {
        page: 2,
        limit: 5,
        total: 1,
        totalPages: 1,
      },
    });
    mockExpenses.findOne.mockResolvedValue(expense);
    mockExpenses.update.mockResolvedValue({
      ...expense,
      amount: '20.25',
    });
    mockExpenses.remove.mockResolvedValue({
      message: 'Expense deleted successfully',
    });
    mockExpenses.summary.mockResolvedValue({
      total: '12.50',
      byCategory: [{ category: 'MATERIAL', amount: '12.50' }],
    });
  });

  afterAll(async () => {
    await gatewayApp.close();
    await projectApp.close();

    await new Promise<void>((resolve, reject) => {
      authServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (originalProjectUrl === undefined) {
      delete process.env.PROJECT_SERVICE_URL;
    } else {
      process.env.PROJECT_SERVICE_URL = originalProjectUrl;
    }

    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });

  it('creates an expense using the authenticated actor', async () => {
    const response = await request(gatewayServer)
      .post(`/api/projects/${projectId}/expenses`)
      .set('authorization', token('accountant'))
      .set('x-user-id', 'admin-id')
      .send(validCreate)
      .expect(201);

    const body = response.body as GatewayBody<typeof expense>;

    expect(body.success).toBe(true);
    expect(body.data.amount).toBe('12.50');

    // Client-supplied x-user-id must not override /auth/me.
    expect(mockExpenses.create).toHaveBeenCalledWith(
      projectId,
      validCreate,
      'accountant-id',
    );
  });

  it('forwards pagination and category filters', async () => {
    await request(gatewayServer)
      .get(`/api/projects/${projectId}/expenses`)
      .query({
        page: '2',
        limit: '5',
        category: 'MATERIAL',
      })
      .set('authorization', token('accountant'))
      .expect(200);

    const calls = mockExpenses.findAll.mock.calls[0] as [
      string,
      {
        page: number;
        limit: number;
        category: string;
      },
      string,
    ];

    expect(calls[0]).toBe(projectId);
    expect(calls[1].page).toBe(2);
    expect(calls[1].limit).toBe(5);
    expect(calls[1].category).toBe('MATERIAL');
    expect(calls[2]).toBe('accountant-id');
  });

  it('allows Project Managers to read summaries', async () => {
    const response = await request(gatewayServer)
      .get(`/api/projects/${projectId}/expenses/summary`)
      .set('authorization', token('manager'))
      .expect(200);

    const body = response.body as GatewayBody<{
      total: string;
    }>;

    expect(body.data.total).toBe('12.50');
    expect(mockExpenses.summary).toHaveBeenCalledWith(projectId, 'manager-id');
  });

  it('retrieves a single expense', async () => {
    await request(gatewayServer)
      .get(`/api/expenses/${expenseId}`)
      .set('authorization', token('manager'))
      .expect(200);

    expect(mockExpenses.findOne).toHaveBeenCalledWith(expenseId, 'manager-id');
  });

  it('allows Accountants to update expenses', async () => {
    await request(gatewayServer)
      .patch(`/api/expenses/${expenseId}`)
      .set('authorization', token('accountant'))
      .send({ amount: '20.25' })
      .expect(200);

    expect(mockExpenses.update).toHaveBeenCalledWith(
      expenseId,
      { amount: '20.25' },
      'accountant-id',
    );
  });

  it('allows only Admins to delete expenses', async () => {
    await request(gatewayServer)
      .delete(`/api/expenses/${expenseId}`)
      .set('authorization', token('admin'))
      .expect(200);

    expect(mockExpenses.remove).toHaveBeenCalledWith(expenseId, 'admin-id');

    await request(gatewayServer)
      .delete(`/api/expenses/${expenseId}`)
      .set('authorization', token('accountant'))
      .expect(403);

    expect(mockExpenses.remove).toHaveBeenCalledTimes(1);
  });

  it('denies expense creation to Project Managers', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/expenses`)
      .set('authorization', token('manager'))
      .send(validCreate)
      .expect(403);

    expect(mockExpenses.create).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', async () => {
    const response = await request(gatewayServer)
      .get(`/api/projects/${projectId}/expenses`)
      .expect(401);

    const body = response.body as { code: string };

    expect(body.code).toBe(ErrorCode.TOKEN_MISSING);
    expect(mockExpenses.findAll).not.toHaveBeenCalled();
  });

  it('rejects invalid expense amounts', async () => {
    await request(gatewayServer)
      .post(`/api/projects/${projectId}/expenses`)
      .set('authorization', token('accountant'))
      .send({ ...validCreate, amount: '0.00' })
      .expect(400);

    expect(mockExpenses.create).not.toHaveBeenCalled();
  });

  it('rejects invalid project identifiers', async () => {
    await request(gatewayServer)
      .get('/api/projects/not-a-uuid/expenses')
      .set('authorization', token('accountant'))
      .expect(400);

    expect(mockExpenses.findAll).not.toHaveBeenCalled();
  });

  it('preserves project access errors from downstream', async () => {
    mockExpenses.findAll.mockRejectedValueOnce(
      new ForbiddenException({
        code: ErrorCode.PROJECT_ACCESS_DENIED,
        message: 'Project access denied.',
      }),
    );

    const response = await request(gatewayServer)
      .get(`/api/projects/${projectId}/expenses`)
      .set('authorization', token('manager'))
      .expect(403);

    const body = response.body as { code: string };

    expect(body.code).toBe(ErrorCode.PROJECT_ACCESS_DENIED);
  });
});
