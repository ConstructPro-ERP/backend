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

  const createHandler = handlerWithRoles('Sales Manager', 'Admin');
  const readHandler = handlerWithRoles(
    'Sales Manager',
    'Admin',
    'Project Manager',
    'Accountant',
  );
  const approveHandler = handlerWithRoles('Admin', 'Management');

  it('allows Sales Manager to POST /quotations', () => {
    expect(
      guard.canActivate(makeContext(['Sales Manager'], createHandler)),
    ).toBe(true);
  });

  it('allows Admin to POST /quotations', () => {
    expect(guard.canActivate(makeContext(['Admin'], createHandler))).toBe(true);
  });

  it('throws 403 when Accountant tries to POST /quotations', () => {
    expect(() =>
      guard.canActivate(makeContext(['Accountant'], createHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when Project Manager tries to POST /quotations', () => {
    expect(() =>
      guard.canActivate(makeContext(['Project Manager'], createHandler)),
    ).toThrow(ForbiddenException);
  });

  it('allows Accountant to GET /quotations/:id', () => {
    expect(guard.canActivate(makeContext(['Accountant'], readHandler))).toBe(
      true,
    );
  });

  it('allows Project Manager to GET /quotations/:id', () => {
    expect(
      guard.canActivate(makeContext(['Project Manager'], readHandler)),
    ).toBe(true);
  });

  // PATCH /quotations/:id/approve — Admin and Management only
  it('allows Admin to PATCH /quotations/:id/approve', () => {
    expect(guard.canActivate(makeContext(['Admin'], approveHandler))).toBe(
      true,
    );
  });

  it('allows Management to PATCH /quotations/:id/approve', () => {
    expect(guard.canActivate(makeContext(['Management'], approveHandler))).toBe(
      true,
    );
  });

  it('throws 403 when Sales role tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['Sales Manager'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when Accountant tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['Accountant'], approveHandler)),
    ).toThrow(ForbiddenException);
  });

  it('throws 403 when Project Manager tries to PATCH /quotations/:id/approve', () => {
    expect(() =>
      guard.canActivate(makeContext(['Project Manager'], approveHandler)),
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
