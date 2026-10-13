import { INestApplication } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { of, throwError } from 'rxjs';
import { InvoicesGatewayController } from '../../apps/api-gateway/src/controllers/invoices-gateway.controller';
import { PaymentsGatewayController } from '../../apps/api-gateway/src/controllers/payments-gateway.controller';
import { AnalyticsGatewayController } from '../../apps/api-gateway/src/controllers/analytics-gateway.controller';
import { AiForecastingGatewayController } from '../../apps/api-gateway/src/controllers/ai-forecasting-gateway.controller';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';

describe('Finance, dashboard and AI gateway authorization over HTTP', () => {
  let app: INestApplication;
  const downstream = jest.fn();
  const http = {
    get: jest.fn(
      (url: string, options?: { headers?: { authorization?: string } }) => {
        if (url.endsWith('/auth/me')) {
          const role = options?.headers?.authorization?.replace('Bearer ', '');
          return role === 'invalid'
            ? throwError(() => new Error('invalid token'))
            : of({ data: { id: 'actor-1', role } });
        }
        downstream(url);
        return of({ data: { ok: true } });
      },
    ),
    post: jest.fn((url: string) => {
      downstream(url);
      return of({ data: { ok: true } });
    }),
  };
  const paths = [
    '/invoices',
    '/payments',
    '/analytics/dashboard/summary',
    '/ai-forecasting/projects/00000000-0000-4000-8000-000000000001/risk',
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        InvoicesGatewayController,
        PaymentsGatewayController,
        AnalyticsGatewayController,
        AiForecastingGatewayController,
      ],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: HttpService, useValue: http },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function call(path: string) {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    return path === '/payments' || path === '/invoices'
      ? request(server).post(path).send({})
      : request(server).get(path);
  }

  it.each(paths)(
    'rejects anonymous requests to %s without forwarding',
    async (path) => {
      await call(path).expect(401);
      expect(downstream).not.toHaveBeenCalled();
    },
  );
  it.each(paths)('rejects invalid tokens for %s', async (path) => {
    await call(path).set('Authorization', 'Bearer invalid').expect(401);
    expect(downstream).not.toHaveBeenCalled();
  });
  it.each(paths)(
    'rejects project managers for %s without forwarding',
    async (path) => {
      await call(path)
        .set('Authorization', 'Bearer PROJECT_MANAGER')
        .expect(403);
      expect(downstream).not.toHaveBeenCalled();
    },
  );
  it.each(['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'])(
    'allows %s on all owned workflows',
    async (role) => {
      for (const path of paths) {
        await call(path)
          .set('Authorization', `Bearer ${role}`)
          .expect(path === '/payments' || path === '/invoices' ? 201 : 200);
      }
      expect(downstream).toHaveBeenCalledTimes(paths.length);
    },
  );
});
