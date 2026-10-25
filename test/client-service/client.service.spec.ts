import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { ClientService } from '../../apps/client-service/src/client.service';
import { ClientRepository } from '../../apps/client-service/src/repository/client.repository';

describe('ClientService — portal account linking', () => {
  const repository = {
    findById: jest.fn(),
    findPortalUserCandidate: jest.fn(),
    linkPortalUserIfUnlinked: jest.fn(),
  };

  let service: ClientService;

  const customer = {
    id: 'customer-1',
    leadId: 'lead-1',
    userId: null as string | null,
  };

  const user = {
    id: 'user-1',
    status: UserStatus.ACTIVE,
    role: { roleName: 'CLIENT_PORTAL_USER' },
    customer: null as { id: string } | null,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    repository.findById.mockResolvedValue({ ...customer });
    repository.findPortalUserCandidate.mockResolvedValue({ ...user });
    repository.linkPortalUserIfUnlinked.mockResolvedValue({ count: 1 });

    service = new ClientService(repository as unknown as ClientRepository);
  });

  it('links an eligible user to an existing customer', async () => {
    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).resolves.toEqual({
      customerId: 'customer-1',
      userId: 'user-1',
    });

    expect(repository.linkPortalUserIfUnlinked).toHaveBeenCalledWith(
      'customer-1',
      'user-1',
    );
  });

  it('allows repeated linking to the same user', async () => {
    repository.findById.mockResolvedValue({
      ...customer,
      userId: 'user-1',
    });

    repository.findPortalUserCandidate.mockResolvedValue({
      ...user,
      customer: { id: 'customer-1' },
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).resolves.toEqual({
      customerId: 'customer-1',
      userId: 'user-1',
    });

    expect(repository.linkPortalUserIfUnlinked).not.toHaveBeenCalled();
  });

  it('rejects an unknown customer', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.linkPortalUser('missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects customers without a linked lead', async () => {
    repository.findById.mockResolvedValue({
      ...customer,
      leadId: null,
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects an unknown user', async () => {
    repository.findPortalUserCandidate.mockResolvedValue(null);

    await expect(
      service.linkPortalUser('customer-1', 'missing'),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects inactive users', async () => {
    repository.findPortalUserCandidate.mockResolvedValue({
      ...user,
      status: UserStatus.INACTIVE,
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects users without the client portal role', async () => {
    repository.findPortalUserCandidate.mockResolvedValue({
      ...user,
      role: { roleName: 'ACCOUNTANT' },
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not overwrite an existing customer association', async () => {
    repository.findById.mockResolvedValue({
      ...customer,
      userId: 'another-user',
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(ConflictException);

    expect(repository.linkPortalUserIfUnlinked).not.toHaveBeenCalled();
  });

  it('does not link a user assigned to another customer', async () => {
    repository.findPortalUserCandidate.mockResolvedValue({
      ...user,
      customer: { id: 'customer-2' },
    });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(ConflictException);

    expect(repository.linkPortalUserIfUnlinked).not.toHaveBeenCalled();
  });

  it('handles a concurrent customer association change', async () => {
    repository.linkPortalUserIfUnlinked.mockResolvedValue({ count: 0 });

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('handles database uniqueness conflicts', async () => {
    repository.linkPortalUserIfUnlinked.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed.', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      service.linkPortalUser('customer-1', 'user-1'),
    ).rejects.toThrow(ConflictException);
  });
});

describe('ClientService — Customer CRUD', () => {
  const repository = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByLeadId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const customer = {
    id: 'customer-1',
    fullName: 'Test Customer',
    leadId: 'lead-1',
    userId: null,
  };

  let service: ClientService;

  beforeEach(() => {
    jest.resetAllMocks();

    repository.create.mockResolvedValue(customer);
    repository.findAll.mockResolvedValue([customer]);
    repository.findById.mockResolvedValue(customer);
    repository.findByLeadId.mockResolvedValue(null);
    repository.update.mockResolvedValue(customer);
    repository.delete.mockResolvedValue(customer);

    service = new ClientService(repository as unknown as ClientRepository);
  });

  it('creates a Customer without a Lead', async () => {
    await expect(
      service.create({ fullName: 'Test Customer' }),
    ).resolves.toEqual(customer);

    expect(repository.findByLeadId).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith({
      fullName: 'Test Customer',
      leadId: undefined,
    });
  });

  it('creates a Customer with an available Lead', async () => {
    await service.create({
      fullName: 'Test Customer',
      leadId: 'lead-1',
    });

    expect(repository.findByLeadId).toHaveBeenCalledWith('lead-1');
    expect(repository.create).toHaveBeenCalledWith({
      fullName: 'Test Customer',
      leadId: 'lead-1',
    });
  });

  it('rejects a Lead already assigned to another Customer', async () => {
    repository.findByLeadId.mockResolvedValue(customer);

    await expect(
      service.create({
        fullName: 'Another Customer',
        leadId: 'lead-1',
      }),
    ).rejects.toThrow(ConflictException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns all Customers', async () => {
    await expect(service.findAll()).resolves.toEqual([customer]);
    expect(repository.findAll).toHaveBeenCalledTimes(1);
  });

  it('returns an existing Customer', async () => {
    await expect(service.findOne('customer-1')).resolves.toEqual(customer);

    expect(repository.findById).toHaveBeenCalledWith('customer-1');
  });

  it('rejects a missing Customer lookup', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('updates an existing Customer', async () => {
    const dto = { fullName: 'Updated Customer' };

    await expect(service.update('customer-1', dto)).resolves.toEqual(customer);

    expect(repository.findById).toHaveBeenCalledWith('customer-1');
    expect(repository.update).toHaveBeenCalledWith('customer-1', dto);
  });

  it('rejects updates to a missing Customer', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.update('missing', { fullName: 'Updated' }),
    ).rejects.toThrow(NotFoundException);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('deletes an existing Customer', async () => {
    await service.remove('customer-1');

    expect(repository.findById).toHaveBeenCalledWith('customer-1');
    expect(repository.delete).toHaveBeenCalledWith('customer-1');
  });

  it('rejects deletion of a missing Customer', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);

    expect(repository.delete).not.toHaveBeenCalled();
  });
});
