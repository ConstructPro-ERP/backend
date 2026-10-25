import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentsGatewayController } from './payments-gateway.controller';
import { RolesGuard } from '../guards/roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
    getHandler: () => () => undefined,
    getClass: () => PaymentsGatewayController,
  } as unknown as ExecutionContext;
}

describe('PaymentsGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['ADMIN', 'ACCOUNTANT', 'FINANCE', 'MANAGEMENT'])(
    'allows %s to record payments',
    (role) => {
      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it('rejects a project manager', () => {
    expect(() => guard.canActivate(contextFor('PROJECT_MANAGER'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
