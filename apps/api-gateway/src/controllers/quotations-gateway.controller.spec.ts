import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

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
    expect(guard.canActivate(makeContext(['Admin'], approveHandler))).toBe(true);
  });

  it('allows Management to PATCH /quotations/:id/approve', () => {
    expect(
      guard.canActivate(makeContext(['Management'], approveHandler)),
    ).toBe(true);
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
