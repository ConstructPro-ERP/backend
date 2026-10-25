import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AnalyticsGatewayController } from './analytics-gateway.controller';
import { RolesGuard } from '../guards/roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
    getHandler: () => () => undefined,
    getClass: () => AnalyticsGatewayController,
  } as unknown as ExecutionContext;
}

describe('AnalyticsGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['ADMIN', 'ACCOUNTANT', 'FINANCE', 'MANAGEMENT'])(
    'allows %s to access analytics KPIs',
    (role) => {
      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it('rejects a sales manager', () => {
    expect(() => guard.canActivate(contextFor('SALES_MANAGER'))).toThrow(
      ForbiddenException,
    );
  });
});
