import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { ROLES_KEY } from '../../apps/api-gateway/src/decorators/roles.decorator';
import { HttpService } from '@nestjs/axios';
import type { Request } from 'express';
import { of } from 'rxjs';
import { QuotationsGatewayController } from '../../apps/api-gateway/src/controllers/quotations-gateway.controller';

function makeContext(
  userRoles: string[],
  handler: () => void,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { role: userRoles[0], roles: userRoles } }),
    }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard — quotations endpoint access', () => {
  let guard: RolesGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
  });

  function handlerWithRoles(...roles: string[]) {
    const fn = () => {};
    Reflect.defineMetadata(ROLES_KEY, roles, fn);
    return fn;
  }

  const createHandler = handlerWithRoles('SALES_MANAGER', 'ADMIN');

  const readHandler = handlerWithRoles(
    'SALES_MANAGER',
    'ADMIN',
    'PROJECT_MANAGER',
    'ACCOUNTANT',
  );

  const approveHandler = handlerWithRoles('ADMIN');

  it('allows SALES_MANAGER to POST /quotations', () => {
    expect(
      guard.canActivate(makeContext(['SALES_MANAGER'], createHandler)),
    ).toBe(true);
  });

  it('allows ADMIN to POST /quotations', () => {
    expect(guard.canActivate(makeContext(['ADMIN'], createHandler))).toBe(true);
  });

  it('throws 403 when ACCOUNTANT tries to POST /quotations', () => {
    expect(() =>
      guard.canActivate(makeContext(['ACCOUNTANT'], createHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when PROJECT_MANAGER tries to POST /quotations', () => {
    expect(() =>
      guard.canActivate(makeContext(['PROJECT_MANAGER'], createHandler)),
    ).toThrow(ForbiddenException);
  });

  it('allows ACCOUNTANT to GET /quotations/:id', () => {
    expect(guard.canActivate(makeContext(['ACCOUNTANT'], readHandler))).toBe(
      true,
    );
  });

  it('allows PROJECT_MANAGER to GET /quotations/:id', () => {
    expect(
      guard.canActivate(makeContext(['PROJECT_MANAGER'], readHandler)),
    ).toBe(true);
  });

  it('allows SALES_MANAGER to GET /quotations/:id', () => {
    expect(guard.canActivate(makeContext(['SALES_MANAGER'], readHandler))).toBe(
      true,
    );
  });

  it('allows ADMIN to PATCH /quotations/:id/approve', () => {
    expect(guard.canActivate(makeContext(['ADMIN'], approveHandler))).toBe(
      true,
    );
  });

  it('throws 403 when SALES_MANAGER tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['SALES_MANAGER'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when ACCOUNTANT tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['ACCOUNTANT'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when PROJECT_MANAGER tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['PROJECT_MANAGER'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when CLIENT_PORTAL_USER tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['CLIENT_PORTAL_USER'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('does not accept the obsolete MANAGEMENT role alias for approval', () => {
    expect(() =>
      guard.canActivate(makeContext(['MANAGEMENT'], approveHandler)),
    ).toThrow(ForbiddenException);
  });
});

describe('QuotationsGatewayController', () => {
  let controller: QuotationsGatewayController;
  let httpService: {
    patch: jest.Mock;
  };

  beforeEach(async () => {
    httpService = {
      patch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuotationsGatewayController],
      providers: [{ provide: HttpService, useValue: httpService }],
    }).compile();

    controller = module.get<QuotationsGatewayController>(
      QuotationsGatewayController,
    );
  });

  it('forwards approveAndConvert() body to PATCH /quotations/:id/approve', async () => {
    httpService.patch.mockReturnValue(
      of({
        data: {
          projectId: 'project-1',
          projectStatus: 'ACTIVE',
        },
      }),
    );

    const body = {
      targetProjectId: '00000000-0000-4000-8000-000000000001',
    };

    const req = {
      headers: {
        authorization: 'Bearer test-token',
      },
    } as unknown as Request;

    const result = await controller.approveAndConvert('quotation-1', body, req);

    expect(httpService.patch).toHaveBeenCalledWith(
      expect.stringContaining('/quotations/quotation-1/approve'),
      body,
      {
        headers: {
          authorization: 'Bearer test-token',
        },
      },
    );

    expect(result).toEqual({
      projectId: 'project-1',
      projectStatus: 'ACTIVE',
    });
  });
});
