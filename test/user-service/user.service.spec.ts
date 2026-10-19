import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserService } from '../../apps/user-service/src/user.service';
import { UserRepository } from '../../apps/user-service/src/repositories/user.repository';
import { ErrorCode } from '../../shared/error-codes';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));

describe('UserService user management', () => {
  const repository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findProjectManagers: jest.fn(),
    findRoleById: jest.fn(),
    findRoleByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    existsById: jest.fn(),
  };
  const safeUser = {
    id: 'user-1',
    fullName: 'Alex Smith',
    email: 'alex@example.com',
    roleId: null,
    role: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
  const user = { ...safeUser, password: 'stored-password-hash' };
  const dto = { fullName: user.fullName, email: user.email };
  let service: UserService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.existsById.mockResolvedValue(true);
    repository.findById.mockResolvedValue(user);
    repository.findByEmail.mockResolvedValue(null);
    repository.create.mockResolvedValue(user);
    repository.update.mockResolvedValue(user);
    const hash = bcrypt.hash as jest.MockedFunction<
      (password: string, rounds: number) => Promise<string>
    >;
    hash.mockResolvedValue('hashed-password');
    service = new UserService(repository as unknown as UserRepository);
  });

  it('lists users without exposing password hashes', async () => {
    repository.findAll.mockResolvedValue([user]);
    await expect(service.findAll()).resolves.toEqual([safeUser]);
  });

  it('returns an empty list when there are no users', async () => {
    repository.findAll.mockResolvedValue([]);
    await expect(service.findAll()).resolves.toEqual([]);
  });

  it('returns a safe user by ID', async () => {
    await expect(service.findById(user.id)).resolves.toEqual(safeUser);
    expect(repository.findById).toHaveBeenCalledWith(user.id);
  });

  it('returns null for an unknown user', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findById('missing')).resolves.toBeNull();
  });

  it('returns project manager candidates from the repository', async () => {
    const managers = [
      {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: { roleName: 'ADMIN' },
      },
    ];
    repository.findProjectManagers.mockResolvedValue(managers);
    await expect(service.findProjectManagers()).resolves.toEqual(managers);
  });

  it('hashes passwords and creates active users without exposing credentials', async () => {
    await expect(
      service.create({ ...dto, password: 'secret123' }),
    ).resolves.toEqual(safeUser);
    expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 12);
    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      password: 'hashed-password',
      status: UserStatus.ACTIVE,
    });
  });

  it('allows passwordless users with no role assigned', async () => {
    await service.create(dto);
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(repository.findRoleById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      password: null,
      status: UserStatus.ACTIVE,
    });
  });

  it('connects an existing role during creation', async () => {
    repository.findRoleById.mockResolvedValue({ id: 'role-1' });
    await service.create({ ...dto, roleId: 'role-1' });
    expect(repository.findRoleById).toHaveBeenCalledWith('role-1');
    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      password: null,
      status: UserStatus.ACTIVE,
      role: { connect: { id: 'role-1' } },
    });
  });

  it('rejects duplicate email addresses without creating a user', async () => {
    repository.findByEmail.mockResolvedValue(user);
    await expect(service.create(dto)).rejects.toThrow('User already exists');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each(['create', 'update'] as const)(
    'rejects unknown roles on %s',
    async (operation) => {
      repository.findRoleById.mockResolvedValue(null);
      const request =
        operation === 'create'
          ? service.create({ ...dto, roleId: 'missing' })
          : service.update(user.id, { roleId: 'missing' });
      await expect(request).rejects.toMatchObject({
        response: { code: ErrorCode.ROLE_NOT_FOUND },
      });
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it('updates supplied fields and connects a valid role', async () => {
    repository.findRoleById.mockResolvedValue({ id: 'role-1' });
    const changes = {
      fullName: 'New Name',
      email: 'new@example.com',
      status: UserStatus.INACTIVE,
      roleId: 'role-1',
    };
    const updated = {
      ...user,
      ...changes,
      role: { id: 'role-1', roleName: 'ADMIN' },
    };
    repository.update.mockResolvedValue(updated);
    const result = await service.update(user.id, changes);
    expect(repository.update).toHaveBeenCalledWith(user.id, {
      fullName: changes.fullName,
      email: changes.email,
      status: changes.status,
      role: { connect: { id: 'role-1' } },
    });
    expect(result).toMatchObject(changes);
    expect(result).not.toHaveProperty('password');
  });

  it('does not overwrite omitted fields during partial updates', async () => {
    await service.update(user.id, { fullName: 'New Name' });
    expect(repository.update).toHaveBeenCalledWith(user.id, {
      fullName: 'New Name',
    });
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.findRoleById).not.toHaveBeenCalled();
  });

  it('rejects an email belonging to another user', async () => {
    repository.findByEmail.mockResolvedValue({ ...user, id: 'other-user' });
    await expect(
      service.update(user.id, { email: user.email }),
    ).rejects.toThrow('Email is already used by another user');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows a user to retain their own email', async () => {
    repository.findByEmail.mockResolvedValue(user);
    await service.update(user.id, { email: user.email });
    expect(repository.update).toHaveBeenCalledWith(user.id, {
      email: user.email,
    });
  });

  it('updates profile names and returns a safe user', async () => {
    repository.update.mockResolvedValue({ ...user, fullName: 'New Name' });
    await expect(
      service.updateProfile(user.id, { fullName: 'New Name' }),
    ).resolves.toEqual({ ...safeUser, fullName: 'New Name' });
    expect(repository.update).toHaveBeenCalledWith(user.id, {
      fullName: 'New Name',
    });
  });

  it.each(['update', 'updateProfile', 'remove'] as const)(
    'rejects %s for missing users without writing',
    async (operation) => {
      repository.existsById.mockResolvedValue(false);
      await expect(service[operation]('missing', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.deactivate).not.toHaveBeenCalled();
    },
  );

  it('soft-deletes active users and excludes passwords from the response', async () => {
    const result = await service.remove(user.id);
    expect(repository.deactivate).toHaveBeenCalledWith(user.id);
    expect(result).not.toHaveProperty('password');
    expect(result?.id).toBe(user.id);
  });

  it('rejects deleting an already inactive user', async () => {
    repository.findById.mockResolvedValue({
      ...user,
      status: UserStatus.INACTIVE,
    });
    await expect(service.remove(user.id)).rejects.toThrow(BadRequestException);
    expect(repository.deactivate).not.toHaveBeenCalled();
  });

  it('handles a user disappearing between the existence check and lookup', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.remove(user.id)).rejects.toThrow(NotFoundException);
    expect(repository.deactivate).not.toHaveBeenCalled();
  });

  it('propagates persistence failures', async () => {
    repository.update.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      service.update(user.id, { fullName: 'New Name' }),
    ).rejects.toThrow('Database unavailable');
  });
});
