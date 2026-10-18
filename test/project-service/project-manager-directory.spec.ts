import { HttpService } from '@nestjs/axios';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { of } from 'rxjs';
import { UsersGatewayController } from '../../apps/api-gateway/src/controllers/users-gateway.controller';
import { RolesGuard } from '../../apps/api-gateway/src/guards/roles.guard';
import { UserRepository } from '../../apps/user-service/src/repositories/user.repository';
import { UserService } from '../../apps/user-service/src/user.service';
import { UserController } from '../../apps/user-service/src/user.controller';
import { PrismaService } from '../../prisma/prisma.service';

describe('Project manager directory', () => {
  it('queries active admins and managers through their role and selects only directory fields', async () => {
    const users = [
      {
        id: 'admin-1',
        fullName: 'Admin',
        email: 'admin@test.com',
        role: { roleName: 'ADMIN' },
      },
    ];
    const findMany = jest.fn().mockResolvedValue(users);
    const repository = new UserRepository({
      user: { findMany },
    } as unknown as PrismaService);
    const controller = new UserController(new UserService(repository));
    await expect(controller.findProjectManagers()).resolves.toEqual(users);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        role: { is: { roleName: { in: ['PROJECT_MANAGER', 'ADMIN'] } } },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: { select: { roleName: true } },
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  });

  it('forwards the directory request and authorization header', async () => {
    const get = jest.fn().mockReturnValue(of({ data: [] }));
    const controller = new UsersGatewayController({
      get,
    } as unknown as HttpService);
    await expect(
      controller.findProjectManagers({
        headers: { authorization: 'Bearer test' },
      } as Request),
    ).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\/project-managers$/),
      { headers: { authorization: 'Bearer test' } },
    );
  });

  it.each(['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT', undefined])(
    'enforces directory access for %s',
    (role) => {
      const handler: unknown = Object.getOwnPropertyDescriptor(
        UsersGatewayController.prototype,
        'findProjectManagers',
      )?.value;

      if (typeof handler !== 'function') {
        throw new Error('Project manager directory handler not found.');
      }

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ user: role ? { role } : undefined }),
        }),
        getHandler: () => handler,
        getClass: () => UsersGatewayController,
      } as unknown as ExecutionContext;

      const guard = new RolesGuard(new Reflector());

      if (role === 'ADMIN') {
        expect(guard.canActivate(context)).toBe(true);
      } else {
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
    },
  );
});
