import { HttpModule } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import request from 'supertest';
import { JwtAuthGuard } from '../../apps/api-gateway/src/guards/jwt-auth.guard';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { HttpExceptionFilter } from '../../apps/api-gateway/src/filters/http-exception.filter';
import { ResponseInterceptor } from '../../apps/api-gateway/src/interceptors/response.interceptor';

const id = '11111111-1111-4111-8111-111111111111';
const roles = [
  'ADMIN',
  'MANAGEMENT',
  'SALES_MANAGER',
  'PROJECT_MANAGER',
  'ACCOUNTANT',
  'CLIENT_PORTAL_USER',
];
const staff = roles.slice(0, 5);
const sales = roles.slice(0, 3);
type Method = 'get' | 'post' | 'patch' | 'delete';
type Route = { method: Method; path: string; allowed: string[]; body?: object };

function responseBody(response: { body: unknown }): Record<string, unknown> {
  const body = response.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Expected a JSON response object');
  }
  return body as Record<string, unknown>;
}
const routes: Route[] = [
  { method: 'get', path: '/users', allowed: ['ADMIN'] },
  {
    method: 'post',
    path: '/users',
    allowed: ['ADMIN'],
    body: { fullName: 'Test User', email: 'user@example.test', roleId: id },
  },
  { method: 'get', path: '/users/project-managers', allowed: ['ADMIN'] },
  {
    method: 'get',
    path: `/users/${id}`,
    allowed: ['ADMIN', 'SALES_MANAGER', 'PROJECT_MANAGER', 'ACCOUNTANT'],
  },
  {
    method: 'patch',
    path: `/users/${id}`,
    allowed: ['ADMIN'],
    body: { fullName: 'Updated User' },
  },
  {
    method: 'patch',
    path: `/users/${id}/profile`,
    allowed: roles,
    body: { fullName: 'My Profile' },
  },
  { method: 'delete', path: `/users/${id}`, allowed: ['ADMIN'] },
  { method: 'get', path: '/clients', allowed: staff },
  { method: 'get', path: `/clients/${id}`, allowed: staff },
  {
    method: 'post',
    path: '/clients',
    allowed: sales,
    body: { fullName: 'Test Client', leadId: id },
  },
  {
    method: 'patch',
    path: `/clients/${id}`,
    allowed: sales,
    body: { fullName: 'Updated Client' },
  },
  {
    method: 'patch',
    path: `/clients/${id}/portal-user`,
    allowed: ['ADMIN'],
    body: { userId: id },
  },
  { method: 'delete', path: `/clients/${id}`, allowed: sales },
  { method: 'get', path: '/leads', allowed: sales },
  { method: 'get', path: `/leads/${id}`, allowed: sales },
  {
    method: 'post',
    path: '/leads',
    allowed: sales,
    body: { customerName: 'Test Lead', email: 'lead@example.test' },
  },
  {
    method: 'patch',
    path: `/leads/${id}`,
    allowed: sales,
    body: { customerName: 'Updated Lead' },
  },
  { method: 'delete', path: `/leads/${id}`, allowed: ['ADMIN', 'MANAGEMENT'] },
  {
    method: 'patch',
    path: `/leads/${id}/assign`,
    allowed: ['ADMIN', 'MANAGEMENT'],
    body: { assignedToId: id },
  },
  {
    method: 'patch',
    path: `/leads/${id}/status`,
    allowed: sales,
    body: { status: 'NEW' },
  },
  {
    method: 'post',
    path: `/leads/${id}/notes`,
    allowed: sales,
    body: { content: 'Called customer' },
  },
  { method: 'get', path: `/leads/${id}/notes`, allowed: sales },
  { method: 'delete', path: `/leads/${id}/notes/${id}`, allowed: sales },
  {
    method: 'post',
    path: `/leads/${id}/contacts`,
    allowed: sales,
    body: { label: 'email', value: 'lead@example.test' },
  },
  {
    method: 'patch',
    path: `/leads/${id}/contacts/${id}`,
    allowed: sales,
    body: { label: 'email', value: 'new@example.test' },
  },
  { method: 'delete', path: `/leads/${id}/contacts/${id}`, allowed: sales },
];

describe('Identity and CRM gateway HTTP integration (stub downstream services)', () => {
  let app: INestApplication<Server>;
  let upstream: Server;
  const envKeys = [
    'AUTH_SERVICE_URL',
    'USER_SERVICE_URL',
    'CLIENT_SERVICE_URL',
    'LEAD_SERVICE_URL',
  ] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const calls: {
    method: string;
    path: string;
    authorization?: string;
    actor?: string;
    body: unknown;
  }[] = [];
  let reply: { status: number; body: unknown; location?: string };
  let disconnect = false;

  beforeAll(async () => {
    async function handleRequest(req: IncomingMessage, res: ServerResponse) {
      // Identity lookup is a stub; the gateway's authentication and role guards are real.
      if (req.url === '/auth/me') {
        const role = req.headers.authorization?.replace('Bearer ', '');
        const valid = role && roles.includes(role);
        res.writeHead(valid ? 200 : 401, {
          'content-type': 'application/json',
        });
        res.end(
          JSON.stringify(
            valid
              ? { id, role }
              : {
                  code: role === 'expired' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
                },
          ),
        );
        return;
      }
      let raw = '';
      for await (const chunk of req as AsyncIterable<unknown>) {
        if (!Buffer.isBuffer(chunk)) {
          throw new Error('Expected a request body buffer');
        }
        raw += chunk.toString('utf8');
      }
      calls.push({
        method: req.method!,
        path: req.url!,
        authorization: req.headers.authorization,
        actor: req.headers['x-user-id'] as string | undefined,
        body: raw ? JSON.parse(raw) : undefined,
      });
      if (disconnect) {
        req.socket.destroy();
        return;
      }
      res.writeHead(reply.status, {
        'content-type': 'application/json',
        ...(reply.location ? { location: reply.location } : {}),
      });
      res.end(JSON.stringify(reply.body));
    }
    upstream = createServer((req, res) => {
      void handleRequest(req, res).catch((error: unknown) => {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const address = upstream.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing upstream port');
    for (const key of envKeys)
      process.env[key] = `http://127.0.0.1:${address.port}`;

    // Auth and users capture service URLs at module load time.
    const { AuthGatewayController } = jest.requireActual<
      typeof import('../../apps/api-gateway/src/controllers/auth-gateway.controller')
    >('../../apps/api-gateway/src/controllers/auth-gateway.controller');
    const { UsersGatewayController } = jest.requireActual<
      typeof import('../../apps/api-gateway/src/controllers/users-gateway.controller')
    >('../../apps/api-gateway/src/controllers/users-gateway.controller');
    const { ClientGatewayController } = jest.requireActual<
      typeof import('../../apps/api-gateway/src/controllers/client-gateway.controller')
    >('../../apps/api-gateway/src/controllers/client-gateway.controller');
    const { LeadGatewayController } = jest.requireActual<
      typeof import('../../apps/api-gateway/src/controllers/lead-gateway.controller')
    >('../../apps/api-gateway/src/controllers/lead-gateway.controller');
    const module = await Test.createTestingModule({
      imports: [HttpModule.register({ timeout: 2000, proxy: false })],
      controllers: [
        AuthGatewayController,
        UsersGatewayController,
        ClientGatewayController,
        LeadGatewayController,
      ],
      providers: [JwtAuthGuard, RolesGuard],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    calls.length = 0;
    disconnect = false;
    reply = { status: 200, body: { id } };
  });

  afterAll(async () => {
    await app?.close();
    if (upstream?.listening)
      await new Promise<void>((resolve, reject) =>
        upstream.close((error) => (error ? reject(error) : resolve())),
      );
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function call(method: Method, path: string, role?: string, body?: object) {
    const test = request(app.getHttpServer())[method](`/api${path}`);
    if (role) test.set('Authorization', `Bearer ${role}`);
    if (body) test.send(body);
    return test;
  }

  it.each(routes)('requires authentication: $method $path', async (route) => {
    const response = await call(
      route.method,
      route.path,
      undefined,
      route.body,
    ).expect(401);
    expect(response.body).toMatchObject({
      success: false,
      code: 'TOKEN_MISSING',
    });
    expect(calls).toHaveLength(0);
  });

  describe.each(roles)('%s permissions', (role) => {
    it.each(routes)('$method $path', async (route) => {
      const allowed = route.allowed.includes(role);
      const status = allowed ? (route.method === 'post' ? 201 : 200) : 403;
      const response = await call(
        route.method,
        route.path,
        role,
        route.body,
      ).expect(status);
      if (!allowed) {
        expect(response.body).toMatchObject({
          success: false,
          code: 'INSUFFICIENT_ROLE',
        });
        expect(calls).toHaveLength(0);
        return;
      }
      expect(response.body).toMatchObject({
        success: true,
        statusCode: status,
        data: { id },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: route.method.toUpperCase(),
        authorization: `Bearer ${role}`,
        body: route.body,
      });
      expect(calls[0].path.split('?')[0]).toBe(route.path);
      if (/^\/(clients|leads)/.test(route.path))
        expect(calls[0].actor).toBe(id);
    });
  });

  it.each(['invalid', 'expired'])('rejects %s tokens', async (token) => {
    const response = await call('get', '/users', token).expect(401);
    expect(responseBody(response).code).toBe(
      token === 'expired' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    );
    expect(calls).toHaveLength(0);
  });

  it('forwards lead filters and returns pagination metadata', async () => {
    reply.body = {
      items: [{ id }],
      total: 3,
      page: 2,
      limit: 1,
      totalPages: 3,
    };
    const response = await call(
      'get',
      '/leads?page=2&limit=1&search=Jane%20Doe&status=NEW&sortBy=customerName&sortOrder=asc',
      'SALES_MANAGER',
    ).expect(200);
    const query = new URL(calls[0].path, 'http://localhost').searchParams;
    expect(Object.fromEntries(query)).toEqual({
      page: '2',
      limit: '1',
      search: 'Jane Doe',
      status: 'NEW',
      sortBy: 'customerName',
      sortOrder: 'asc',
    });
    expect(response.body).toMatchObject({
      data: [{ id }],
      meta: { total: 3, page: 2, limit: 1, totalPages: 3 },
    });
  });

  it.each([
    ['post', '/clients', {}],
    ['post', '/clients', { fullName: 'Client', leadId: 'invalid' }],
    ['patch', `/clients/${id}/portal-user`, { userId: 'invalid' }],
    ['patch', '/clients/invalid/portal-user', { userId: id }],
    ['post', '/leads', { customerName: 'Lead', email: 'invalid' }],
    ['patch', `/leads/${id}/assign`, { assignedToId: 'invalid' }],
    ['patch', `/leads/${id}/status`, { status: 'invalid' }],
    ['post', `/leads/${id}/notes`, { content: '' }],
    ['post', `/leads/${id}/contacts`, { label: 'email' }],
    ['get', '/leads?page=0&limit=101', undefined],
    ['post', '/auth/login', { email: 'user@example.test', password: '123' }],
    [
      'post',
      '/auth/register',
      { username: 'User', email: 'invalid', password: 'password', roleId: id },
    ],
    ['post', '/auth/refresh', {}],
  ] as [Method, string, object | undefined][])(
    'validates %s %s',
    async (method, path, body) => {
      const response = await call(method, path, 'ADMIN', body).expect(400);
      expect(response.body).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      if (path !== '/clients/invalid/portal-user') {
        expect(responseBody(response).details).toEqual(expect.any(Array));
      }
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    {
      path: '/auth/login',
      status: 200,
      body: { email: 'user@example.test', password: 'password' },
    },
    {
      path: '/auth/register',
      status: 201,
      body: {
        username: 'User',
        email: 'user@example.test',
        password: 'password',
        roleId: id,
      },
    },
    {
      path: '/auth/refresh',
      status: 201,
      body: { refreshToken: 'test-refresh-token' },
    },
  ])('forwards public $path requests', async ({ path, status, body }) => {
    reply.body = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    };
    const response = await call('post', path, undefined, body).expect(status);
    expect(responseBody(response).data).toEqual(reply.body);
    expect(calls).toEqual([
      expect.objectContaining({ method: 'POST', path, body }),
    ]);
  });

  it('returns the authenticated profile', async () => {
    const response = await call('get', '/auth/me', 'ADMIN').expect(200);
    expect(responseBody(response).data).toEqual({ id, role: 'ADMIN' });
    await call('get', '/auth/me').expect(401);
  });

  it('lists roles publicly at /auth/roles', async () => {
    reply.body = [{ id, roleName: 'ADMIN' }];
    const response = await call('get', '/auth/roles').expect(200);
    expect(response.body).toMatchObject({ success: true, data: reply.body });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/auth/roles',
      authorization: undefined,
    });
  });

  it.each(['/users', '/clients', '/leads', '/auth/roles'])(
    'preserves downstream errors for %s',
    async (path) => {
      reply = {
        status: 404,
        body: { code: 'NOT_FOUND', message: 'Record missing', details: { id } },
      };
      const response = await call('get', path, 'ADMIN').expect(404);
      expect(response.body).toMatchObject({
        success: false,
        ...reply.body,
      });
      expect(responseBody(response).traceId).toEqual(expect.any(String));
    },
  );

  it.each(['/auth/login', '/auth/register', '/auth/refresh'])(
    'preserves auth failures for %s',
    async (path) => {
      const body = {
        username: 'User',
        email: 'user@example.test',
        password: 'password',
        roleId: id,
        refreshToken: 'invalid',
      };
      reply = {
        status: path.endsWith('register') ? 409 : 401,
        body: { code: 'AUTH_REJECTED', message: 'Rejected' },
      };
      const response = await call('post', path, undefined, body).expect(
        reply.status,
      );
      expect(response.body).toMatchObject({ success: false, ...reply.body });
    },
  );

  it.each(['/users', '/clients', '/leads', '/auth/roles'])(
    'returns 502 when downstream disconnects: %s',
    async (path) => {
      disconnect = true;
      const response = await call('get', path, 'ADMIN').expect(502);
      expect(response.body).toMatchObject({ success: false, statusCode: 502 });
    },
  );

  it('strips unknown fields before forwarding validated DTOs', async () => {
    await call('post', '/clients', 'ADMIN', {
      fullName: 'Client',
      injected: true,
    }).expect(201);
    expect(calls[0].body).toEqual({ fullName: 'Client' });
  });

  it.each([
    {
      path: '/auth/google',
      location:
        'https://accounts.google.com/o/oauth2/auth?redirect_uri=https%3A%2F%2Fexample.test%2Fapi%2Fauth%2Fgoogle%2Fcallback',
    },
    {
      path: '/auth/google/callback?code=a%2Bb&state=test',
      location: 'https://example.test/auth/callback?token=test',
    },
  ])('relays OAuth redirect for $path', async ({ path, location }) => {
    reply = { status: 302, body: {}, location };
    const response = await call('get', path).expect(302);
    expect(response.headers.location).toBe(location);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(calls[0].path).toBe(path);
  });

  it('rejects an unexpected OAuth destination', async () => {
    reply = {
      status: 302,
      body: {},
      location: 'https://unexpected.example.test/login',
    };
    const response = await call('get', '/auth/google').expect(502);
    expect(responseBody(response).code).toBe('OAUTH_FAILED');
    expect(response.headers.location).toBeUndefined();
  });
});
