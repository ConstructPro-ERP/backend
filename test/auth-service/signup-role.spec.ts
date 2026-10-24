import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../apps/auth-service/src/auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Signup role assignment', () => {
  const payload = {
    googleId: 'google-1',
    email: 'client@example.com',
    displayName: 'Client',
  };
  const role = { id: 'client-role', roleName: 'CLIENT_PORTAL_USER' };
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    role: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  const service = new AuthService(
    new JwtService(),
    prisma as unknown as PrismaService,
    new ConfigService(),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.role.findFirst.mockResolvedValue(role);
  });

  it('creates new Google accounts with the client portal role', async () => {
    await service.findOrCreateGoogleUser(payload);
    expect(prisma.role.findFirst).toHaveBeenCalledWith({
      where: { roleName: 'CLIENT_PORTAL_USER' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleId: role.id,
        password: null,
      }) as unknown,
    });
  });

  it.each([null, undefined])(
    'assigns the default to a returning unassigned Google account',
    async (existingRole) => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'existing',
        googleId: payload.googleId,
        role: existingRole,
      });
      await service.findOrCreateGoogleUser(payload);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'existing' },
        data: expect.objectContaining({ roleId: role.id }) as unknown,
      });
    },
  );

  it.each([
    'ADMIN',
    'PROJECT_MANAGER',
    'SALES_MANAGER',
    'ACCOUNTANT',
    'CLIENT_PORTAL_USER',
  ])('preserves the assigned %s role', async (roleName) => {
    const existing = {
      id: 'admin',
      googleId: payload.googleId,
      role: { roleName },
    };
    prisma.user.findFirst.mockResolvedValue(existing);
    expect(await service.findOrCreateGoogleUser(payload)).toBe(existing);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('does not create a roleless account when configuration is missing', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(service.findOrCreateGoogleUser(payload)).rejects.toMatchObject(
      { status: 503 },
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('preserves the assigned role when linking an email/password account', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'existing',
      googleId: null,
      role: { roleName: 'PROJECT_MANAGER' },
    });
    await service.findOrCreateGoogleUser(payload);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'existing' },
      data: { googleId: payload.googleId, avatar: undefined },
    });
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('does not update an unassigned account when the default role is missing', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'existing',
      googleId: payload.googleId,
      role: null,
    });
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(service.findOrCreateGoogleUser(payload)).rejects.toMatchObject(
      {
        status: 503,
      },
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a privileged role submitted directly to public registration', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'admin-role',
      roleName: 'ADMIN',
    });
    await expect(
      service.register('Client', 'Password1', payload.email, 'admin-role'),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
