import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RagGatewayController } from './rag-gateway.controller';
import { RolesGuard } from '../guards/roles.guard';

function contextFor(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
    getHandler: () => () => undefined,
    getClass: () => RagGatewayController,
  } as unknown as ExecutionContext;
}

describe('RagGatewayController roles', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(['ADMIN', 'ACCOUNTANT', 'FINANCE', 'MANAGEMENT'])(
    'allows %s to access RAG routes',
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
