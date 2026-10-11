import { INestApplication } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { of, throwError } from 'rxjs';
import { QuotationsGatewayController } from '../../apps/api-gateway/src/controllers/quotations-gateway.controller';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';

describe('Quotation gateway HTTP permissions and forwarding', () => {
  let app: INestApplication;
  let server: Server;
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
  };
  const routes = [
    { method: 'post', path: '/quotations', write: true },
    { method: 'get', path: '/quotations', write: false },
    { method: 'get', path: '/quotations/q', write: false },
    { method: 'get', path: '/quotations/q/pdf', write: false },
    { method: 'put', path: '/quotations/q', write: true },
    ...['submit', 'reject', 'revise', 'direct-approve', 'approve'].map(
      (action) => ({
        method: 'patch',
        path: `/quotations/q/${action}`,
        write: true,
      }),
    ),
  ] as const;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [QuotationsGatewayController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: HttpService, useValue: http },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });
  beforeEach(() => {
    jest.resetAllMocks();
    http.get.mockImplementation(
      (url: string, config: { headers: { authorization: string } }) =>
        of({
          data: url.endsWith('/auth/me')
            ? { role: config.headers.authorization.slice(7) }
            : { id: 'q' },
        }),
    );
    for (const method of ['post', 'put', 'patch'] as const)
      http[method].mockReturnValue(of({ data: { id: 'q' } }));
  });
  afterAll(async () => {
    await app.close();
  });
  function call(method: string, path: string) {
    const agent = request(server);
    switch (method) {
      case 'post':
        return agent.post(path);
      case 'put':
        return agent.put(path);
      case 'patch':
        return agent.patch(path);
      default:
        return agent.get(path);
    }
  }
  it.each(routes)(
    'returns 401 without authentication: $method $path',
    async ({ method, path }) => {
      await call(method, path).expect(401);
      expect(http.get).not.toHaveBeenCalled();
    },
  );
  it.each(routes)(
    'allows sales managers: $method $path',
    async ({ method, path }) => {
      const response = await call(method, path)
        .set('Authorization', 'Bearer SALES_MANAGER')
        .send({})
        .expect(method === 'post' ? 201 : 200);
      expect(response.body).toEqual({ id: 'q' });
    },
  );
  it.each(routes.filter((route) => route.write))(
    'returns 403 for project manager writes: $method $path',
    async ({ method, path }) => {
      await call(method, path)
        .set('Authorization', 'Bearer PROJECT_MANAGER')
        .send({})
        .expect(403);
      expect(http.post).not.toHaveBeenCalled();
      expect(http.put).not.toHaveBeenCalled();
      expect(http.patch).not.toHaveBeenCalled();
    },
  );
  it('preserves downstream domain errors', async () => {
    http.patch.mockReturnValue(
      throwError(() => ({
        response: {
          status: 409,
          data: { code: 'ALREADY_CONVERTED', message: 'Already converted.' },
        },
      })),
    );
    const response = await call('patch', '/quotations/q/approve')
      .set('Authorization', 'Bearer ADMIN')
      .send({})
      .expect(409);
    expect(response.body).toMatchObject({ code: 'ALREADY_CONVERTED' });
  });
  it('returns a safe 502 when quotation-service is unreachable', async () => {
    http.post.mockReturnValue(
      throwError(() => new Error('private internal details')),
    );
    const response = await call('post', '/quotations')
      .set('Authorization', 'Bearer ADMIN')
      .send({})
      .expect(502);
    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Quotation service is unreachable.',
    });
  });
});
