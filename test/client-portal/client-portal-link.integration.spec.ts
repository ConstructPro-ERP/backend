import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ClientPortalAccessService } from '../../apps/client-service/src/client-portal-access.service';
import { ClientService } from '../../apps/client-service/src/client.service';
import { ClientRepository } from '../../apps/client-service/src/repository/client.repository';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(120000);

describe('Client Portal — Neon account linking integration', () => {
  let prisma: PrismaService;
  let clients: ClientService;
  let access: ClientPortalAccessService;

  const runId = randomUUID();

  const created = {
    users: [] as string[],
    leads: [] as string[],
    customers: [] as string[],
  };

  let users: {
    a: string;
    b: string;
    c: string;
    inactive: string;
    manager: string;
  };

  let customers: {
    a: string;
    b: string;
    withoutLead: string;
  };

  async function createUser(
    label: string,
    roleId: string,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        fullName: `Portal Link Test ${label}`,
        email: `portal-link-${runId}-${label}@example.test`,
        password: 'test-password-hash',
        roleId,
        status,
      },
    });

    created.users.push(user.id);
    return user.id;
  }

  async function createLead(label: string): Promise<string> {
    const lead = await prisma.lead.create({
      data: {
        customerName: `Portal Link Test ${runId} ${label}`,
      },
    });

    created.leads.push(lead.id);
    return lead.id;
  }

  async function createCustomer(
    label: string,
    leadId?: string,
  ): Promise<string> {
    const customer = await prisma.customer.create({
      data: {
        fullName: `Portal Link Customer ${runId} ${label}`,
        ...(leadId ? { leadId } : {}),
      },
    });

    created.customers.push(customer.id);
    return customer.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    clients = new ClientService(new ClientRepository(prisma));
    access = new ClientPortalAccessService(prisma);

    const [clientRole, managerRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'CLIENT_PORTAL_USER' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'PROJECT_MANAGER' },
      }),
    ]);

    users = {
      a: await createUser('client-a', clientRole.id),
      b: await createUser('client-b', clientRole.id),
      c: await createUser('client-c', clientRole.id),
      inactive: await createUser(
        'inactive',
        clientRole.id,
        UserStatus.INACTIVE,
      ),
      manager: await createUser('manager', managerRole.id),
    };

    const leadA = await createLead('A');
    const leadB = await createLead('B');

    customers = {
      a: await createCustomer('A', leadA),
      b: await createCustomer('B', leadB),
      withoutLead: await createCustomer('Without Lead'),
    };
  });

  afterEach(async () => {
    if (!prisma || created.customers.length === 0) return;

    // Reset only relationships belonging to this test suite.
    await prisma.customer.updateMany({
      where: {
        id: { in: created.customers },
      },
      data: {
        userId: null,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    try {
      await prisma.customer.deleteMany({
        where: { id: { in: created.customers } },
      });

      await prisma.lead.deleteMany({
        where: { id: { in: created.leads } },
      });

      await prisma.user.deleteMany({
        where: { id: { in: created.users } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('persists a link and enables client portal identity resolution', async () => {
    await expect(access.resolveClient(users.a)).rejects.toThrow(
      ForbiddenException,
    );

    const result = await clients.linkPortalUser(customers.a, users.a);

    expect(result).toEqual({
      customerId: customers.a,
      userId: users.a,
    });

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.a },
      select: { userId: true, leadId: true },
    });

    expect(stored.userId).toBe(users.a);
    expect(stored.leadId).not.toBeNull();

    await expect(access.resolveClient(users.a)).resolves.toEqual({
      userId: users.a,
      customerId: customers.a,
    });
  });

  it('allows repeated linking to the same account', async () => {
    const first = await clients.linkPortalUser(customers.a, users.a);

    const second = await clients.linkPortalUser(customers.a, users.a);

    expect(second).toEqual(first);

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.a },
      select: { userId: true },
    });

    expect(stored.userId).toBe(users.a);
  });

  it('rejects a nonexistent customer', async () => {
    await expect(clients.linkPortalUser(randomUUID(), users.a)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a customer without a lead', async () => {
    await expect(
      clients.linkPortalUser(customers.withoutLead, users.a),
    ).rejects.toThrow(ConflictException);

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.withoutLead },
      select: { userId: true },
    });

    expect(stored.userId).toBeNull();
  });

  it('rejects a nonexistent user', async () => {
    await expect(
      clients.linkPortalUser(customers.a, randomUUID()),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects inactive client accounts', async () => {
    await expect(
      clients.linkPortalUser(customers.a, users.inactive),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects accounts with an incorrect role', async () => {
    await expect(
      clients.linkPortalUser(customers.a, users.manager),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not overwrite an existing customer association', async () => {
    await clients.linkPortalUser(customers.a, users.a);

    await expect(clients.linkPortalUser(customers.a, users.b)).rejects.toThrow(
      ConflictException,
    );

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.a },
      select: { userId: true },
    });

    expect(stored.userId).toBe(users.a);
  });

  it('does not assign the same user to another customer', async () => {
    await clients.linkPortalUser(customers.a, users.a);

    await expect(clients.linkPortalUser(customers.b, users.a)).rejects.toThrow(
      ConflictException,
    );

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.b },
      select: { userId: true },
    });

    expect(stored.userId).toBeNull();
  });

  it('prevents concurrent assignment of one user to two customers', async () => {
    const results = await Promise.allSettled([
      clients.linkPortalUser(customers.a, users.c),
      clients.linkPortalUser(customers.b, users.c),
    ]);

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason as unknown).toBeInstanceOf(ConflictException);

    const linkedCustomers = await prisma.customer.findMany({
      where: {
        id: { in: [customers.a, customers.b] },
        userId: users.c,
      },
      select: { id: true },
    });

    expect(linkedCustomers).toHaveLength(1);
  });

  it('prevents concurrent replacement of one customer link', async () => {
    const results = await Promise.allSettled([
      clients.linkPortalUser(customers.a, users.a),
      clients.linkPortalUser(customers.a, users.b),
    ]);

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason as unknown).toBeInstanceOf(ConflictException);

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: customers.a },
      select: { userId: true },
    });

    expect([users.a, users.b]).toContain(stored.userId);
  });
});
