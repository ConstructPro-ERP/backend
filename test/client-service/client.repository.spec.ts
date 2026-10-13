import { ClientRepository } from '../../apps/client-service/src/repository/client.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientRepository', () => {
  const prisma = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  let repository: ClientRepository;

  beforeEach(() => {
    jest.resetAllMocks();

    repository = new ClientRepository(prisma as unknown as PrismaService);
  });

  it('creates a Customer', async () => {
    const data = { fullName: 'Customer A', leadId: 'lead-1' };
    const record = { id: 'customer-1', ...data };

    prisma.customer.create.mockResolvedValue(record);

    await expect(repository.create(data)).resolves.toEqual(record);
    expect(prisma.customer.create).toHaveBeenCalledWith({ data });
  });

  it('lists Customers alphabetically', async () => {
    prisma.customer.findMany.mockResolvedValue([]);

    await expect(repository.findAll()).resolves.toEqual([]);

    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      orderBy: { fullName: 'asc' },
    });
  });

  it('finds a Customer with Lead details', async () => {
    await repository.findById('customer-1');

    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      include: {
        lead: {
          select: {
            id: true,
            status: true,
            customerName: true,
          },
        },
      },
    });
  });

  it('finds a Customer by Lead ID', async () => {
    await repository.findByLeadId('lead-1');

    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { leadId: 'lead-1' },
    });
  });

  it('retrieves an eligible portal User and their association', async () => {
    await repository.findPortalUserCandidate('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
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

  it('updates only an unlinked Customer with a Lead', async () => {
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.linkPortalUserIfUnlinked('customer-1', 'user-1'),
    ).resolves.toEqual({ count: 1 });

    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        userId: null,
        leadId: { not: null },
      },
      data: { userId: 'user-1' },
    });
  });

  it('updates Customer fields', async () => {
    const data = { fullName: 'Updated Customer' };

    await repository.update('customer-1', data);

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data,
    });
  });

  it('deletes a Customer', async () => {
    await repository.delete('customer-1');

    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
    });
  });
});
