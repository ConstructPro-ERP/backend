import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import type { Request } from 'express';
import type {
  CreateClientDto,
  UpdateClientDto,
} from '../../../client-service/src/dto/client.dto';
import { ClientGatewayController } from './client-gateway.controller';
import { RolesGuard } from '../guards/roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
    getHandler: () => () => undefined,
    getClass: () => ClientGatewayController,
  } as unknown as ExecutionContext;
}

type AuthenticatedTestRequest = Request & {
  user?: { id?: string; sub?: string };
};

function reqWith(
  overrides: Partial<AuthenticatedTestRequest> = {},
): AuthenticatedTestRequest {
  return {
    headers: { authorization: 'Bearer test-token' },
    user: { id: 'user-1' },
    ...overrides,
  } as AuthenticatedTestRequest;
}

describe('ClientGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each([
    'ADMIN',
    'MANAGEMENT',
    'SALES_MANAGER',
    'ACCOUNTANT',
    'PROJECT_MANAGER',
  ])('allows %s to access client read routes', (role) => {
    expect(guard.canActivate(contextFor(role))).toBe(true);
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});

describe('ClientGatewayController', () => {
  let controller: ClientGatewayController;
  let httpService: {
    get: jest.Mock;
    post: jest.Mock;
    patch: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    httpService = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientGatewayController],
      providers: [{ provide: HttpService, useValue: httpService }],
    }).compile();

    controller = module.get<ClientGatewayController>(ClientGatewayController);
    process.env.CLIENT_SERVICE_URL = 'http://client-service.test';
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.CLIENT_SERVICE_URL;
  });

  it('forwards create() to POST /clients with auth + actor headers', async () => {
    httpService.post.mockReturnValue(of({ data: { id: 'client-1' } }));
    const req = reqWith();
    const body: CreateClientDto = { fullName: 'John Silva', leadId: 'lead-1' };

    const result = await controller.create(body, req);

    expect(httpService.post).toHaveBeenCalledWith(
      'http://client-service.test/clients',
      { fullName: 'John Silva', leadId: 'lead-1' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
    expect(result).toEqual({ id: 'client-1' });
  });

  it('forwards findAll() to GET /clients', async () => {
    httpService.get.mockReturnValue(of({ data: [] }));
    const req = reqWith();

    const result = await controller.findAll(req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://client-service.test/clients',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
    expect(result).toEqual([]);
  });

  it('forwards findOne() to GET /clients/:id', async () => {
    httpService.get.mockReturnValue(of({ data: { id: 'client-1' } }));
    const req = reqWith();

    await controller.findOne('client-1', req);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://client-service.test/clients/client-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards update() to PATCH /clients/:id', async () => {
    httpService.patch.mockReturnValue(of({ data: { id: 'client-1' } }));
    const req = reqWith();

    const body: UpdateClientDto = { fullName: 'Jane Doe' };

    await controller.update('client-1', body, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      'http://client-service.test/clients/client-1',
      { fullName: 'Jane Doe' },
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('forwards remove() to DELETE /clients/:id', async () => {
    httpService.delete.mockReturnValue(of({ data: undefined }));
    const req = reqWith();

    await controller.remove('client-1', req);

    expect(httpService.delete).toHaveBeenCalledWith(
      'http://client-service.test/clients/client-1',
      {
        headers: { authorization: 'Bearer test-token', 'x-user-id': 'user-1' },
      },
    );
  });

  it('re-throws the downstream status + body when the client service responds with an error', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: { status: 404, data: { code: 'CLIENT_NOT_FOUND' } },
      })),
    );
    const req = reqWith();

    await expect(controller.findOne('missing-id', req)).rejects.toMatchObject({
      status: 404,
      response: { code: 'CLIENT_NOT_FOUND' },
    });
  });

  it('throws a 502 BAD_GATEWAY when the client service is unreachable', async () => {
    httpService.get.mockReturnValue(throwError(() => ({})));
    const req = reqWith();

    await expect(controller.findOne('client-1', req)).rejects.toBeInstanceOf(
      HttpException,
    );
    await expect(controller.findOne('client-1', req)).rejects.toMatchObject({
      status: 502,
      response: { code: 'CLIENT_SERVICE_UNAVAILABLE' },
    });
  });
});
