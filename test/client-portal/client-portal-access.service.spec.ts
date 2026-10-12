import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import {
  ClientPortalAccessService,
  type ClientPortalIdentity,
} from '../../apps/client-service/src/client-portal-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientPortalAccessService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
    },
  };

  let service: ClientPortalAccessService;

  const identity: ClientPortalIdentity = {
    userId: 'user-a',
    customerId: 'customer-a',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ClientPortalAccessService(prisma as unknown as PrismaService);
  });

  function mockActiveClient() {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-a',
      status: UserStatus.ACTIVE,
      role: { roleName: 'CLIENT_PORTAL_USER' },
      customer: { id: 'customer-a' },
    });
  }

  describe('resolveClient', () => {
    it('rejects missing authentication', async () => {
      await expect(service.resolveClient()).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveClient('unknown-user'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an inactive client account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        status: UserStatus.INACTIVE,
        role: { roleName: 'CLIENT_PORTAL_USER' },
        customer: { id: 'customer-a' },
      });

      await expect(service.resolveClient('user-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an incorrect role', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        status: UserStatus.ACTIVE,
        role: { roleName: 'PROJECT_MANAGER' },
        customer: { id: 'customer-a' },
      });

      await expect(service.resolveClient('user-a')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an account without a linked Customer', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-a',
        status: UserStatus.ACTIVE,
        role: { roleName: 'CLIENT_PORTAL_USER' },
        customer: null,
      });

      await expect(service.resolveClient('user-a')).rejects.toMatchObject({
        response: {
          code: 'CLIENT_PROFILE_NOT_LINKED',
        },
      });
    });

    it('resolves a valid client identity', async () => {
      mockActiveClient();

      await expect(service.resolveClient('user-a')).resolves.toEqual(identity);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-a' },
        select: {
          id: true,
          status: true,
          role: {
            select: { roleName: true },
          },
          customer: {
            select: { id: true },
          },
        },
      });
    });
  });

  describe('project ownership', () => {
    it('requires both owned and exclusively owned quotations', () => {
      expect(service.ownedProjectWhere('customer-a')).toEqual({
        quotations: {
          some: {
            lead: {
              customer: {
                is: { id: 'customer-a' },
              },
            },
          },
          every: {
            lead: {
              customer: {
                is: { id: 'customer-a' },
              },
            },
          },
        },
      });
    });

    it('allows access to a verified owned project', async () => {
      prisma.project.findFirst.mockResolvedValue({
        id: 'project-a',
      });

      await expect(
        service.assertOwnProject('project-a', identity),
      ).resolves.toBeUndefined();

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'project-a',
          ...service.ownedProjectWhere('customer-a'),
        },
        select: { id: true },
      });
    });

    it('hides missing or unauthorized projects', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.assertOwnProject('project-b', identity),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
