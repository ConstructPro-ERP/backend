import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Prisma, ProjectStatus, UserStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { ProjectModule } from '../../apps/project-service/src/project.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../shared/error-codes';

jest.setTimeout(60000);

type ExpenseBody = {
  id: string;
  projectId: string;
  recordedById: string;
  amount: string;
  category: string | null;
  description: string | null;
};

type ExpensePage = {
  data: ExpenseBody[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ExpenseSummary = {
  total: string;
  byCategory: Array<{
    category: string | null;
    amount: string;
  }>;
};

describe('Expense Service — database integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  let adminId: string;
  let accountantId: string;
  let managerId: string;
  let otherManagerId: string;
  let inactiveAccountantId: string;

  const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
  const userIds: string[] = [];
  const projectIds: string[] = [];

  const startDate = new Date('2026-10-01T00:00:00.000Z');
  const endDate = new Date('2026-11-30T23:59:59.999Z');
  const expenseDate = '2026-10-10T00:00:00.000Z';

  async function createProject(projectManagerId = managerId) {
    const project = await prisma.project.create({
      data: {
        projectName: `Expense Integration ${runId}`,
        projectManagerId,
        startDate,
        endDate,
        status: ProjectStatus.PLANNING,
      },
    });

    projectIds.push(project.id);
    return project;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ProjectModule],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);

    const [admin, accountant, manager] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'ADMIN' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'ACCOUNTANT' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'PROJECT_MANAGER' },
      }),
    ]);

    async function createUser(
      label: string,
      roleId: string,
      status: UserStatus = UserStatus.ACTIVE,
    ) {
      const user = await prisma.user.create({
        data: {
          fullName: `Expense Integration ${label}`,
          email: `expense-${label}-${runId}@example.test`,
          password: 'hashed',
          roleId,
          status,
        },
      });

      userIds.push(user.id);
      return user.id;
    }

    adminId = await createUser('admin', admin.id);
    accountantId = await createUser('accountant', accountant.id);
    managerId = await createUser('manager', manager.id);
    otherManagerId = await createUser('other-manager', manager.id);
    inactiveAccountantId = await createUser(
      'inactive-accountant',
      accountant.id,
      UserStatus.INACTIVE,
    );

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (projectIds.length === 0) return;

    // Remove dependent expenses before deleting projects.
    await prisma.expense.deleteMany({
      where: { projectId: { in: projectIds } },
    });

    await prisma.project.deleteMany({
      where: { id: { in: projectIds } },
    });

    projectIds.length = 0;
  });

  afterAll(async () => {
    if (prisma && userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    if (app) await app.close();
  });

  it('persists CRUD with Decimal precision and actor identity', async () => {
    const project = await createProject();

    const created = await request(server)
      .post(`/projects/${project.id}/expenses`)
      .set('x-user-id', accountantId)
      .send({
        amount: '12500.75',
        category: 'MATERIAL',
        description: 'Foundation material',
        expenseDate,
      })
      .expect(201);

    const record = created.body as ExpenseBody;

    expect(record.amount).toBe('12500.75');
    expect(record.recordedById).toBe(accountantId);

    const saved = await prisma.expense.findUniqueOrThrow({
      where: { id: record.id },
    });

    expect(saved.projectId).toBe(project.id);
    expect(saved.recordedById).toBe(accountantId);
    expect(saved.amount).toBeInstanceOf(Prisma.Decimal);
    expect(saved.amount.toFixed(2)).toBe('12500.75');
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);

    // An assigned Project Manager can read the expense.
    const detail = await request(server)
      .get(`/expenses/${record.id}`)
      .set('x-user-id', managerId)
      .expect(200);

    expect((detail.body as ExpenseBody).amount).toBe('12500.75');

    // Accountant can update the amount and clear nullable fields.
    await request(server)
      .patch(`/expenses/${record.id}`)
      .set('x-user-id', accountantId)
      .send({
        amount: '100.10',
        category: null,
        description: null,
      })
      .expect(200);

    const updated = await prisma.expense.findUniqueOrThrow({
      where: { id: record.id },
    });

    expect(updated.amount.toFixed(2)).toBe('100.10');
    expect(updated.category).toBeNull();
    expect(updated.description).toBeNull();
    expect(updated.recordedById).toBe(accountantId);

    // Accountant cannot delete expenses.
    await request(server)
      .delete(`/expenses/${record.id}`)
      .set('x-user-id', accountantId)
      .expect(403);

    // Admin can delete expenses.
    await request(server)
      .delete(`/expenses/${record.id}`)
      .set('x-user-id', adminId)
      .expect(200);

    expect(
      await prisma.expense.findUnique({
        where: { id: record.id },
      }),
    ).toBeNull();
  });

  it('computes exact category summaries, including null category', async () => {
    const project = await createProject();

    for (const entry of [
      { amount: '0.10', category: 'MATERIAL' },
      { amount: '0.20', category: 'MATERIAL' },
      { amount: '1.05', category: null },
    ]) {
      await request(server)
        .post(`/projects/${project.id}/expenses`)
        .set('x-user-id', accountantId)
        .send({ ...entry, expenseDate })
        .expect(201);
    }

    const response = await request(server)
      .get(`/projects/${project.id}/expenses/summary`)
      .set('x-user-id', managerId)
      .expect(200);

    const summary = response.body as ExpenseSummary;

    expect(summary.total).toBe('1.35');
    expect(summary.byCategory).toHaveLength(2);

    expect(
      summary.byCategory.find((row) => row.category === 'MATERIAL')?.amount,
    ).toBe('0.30');

    expect(
      summary.byCategory.find((row) => row.category === null)?.amount,
    ).toBe('1.05');
  });

  it('filters and paginates expenses without mixing projects', async () => {
    const project = await createProject();
    const other = await createProject(otherManagerId);

    await prisma.expense.createMany({
      data: [
        {
          projectId: project.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('0.10'),
          category: 'MATERIAL',
          expenseDate: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          projectId: project.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('0.20'),
          category: 'MATERIAL',
          expenseDate: new Date('2026-10-31T12:00:00.000Z'),
        },
        {
          projectId: project.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('0.30'),
          category: 'LABOUR',
          expenseDate: new Date('2026-10-10T00:00:00.000Z'),
        },
        {
          projectId: project.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('0.40'),
          category: 'MATERIAL',
          expenseDate: new Date('2026-11-01T00:00:00.000Z'),
        },
        {
          projectId: other.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('99.00'),
          category: 'MATERIAL',
          expenseDate: new Date('2026-10-10T00:00:00.000Z'),
        },
      ],
    });

    const endpoint = `/projects/${project.id}/expenses`;
    const query =
      'category=MATERIAL&fromDate=2026-10-01&toDate=2026-10-31' +
      '&limit=1&sortBy=amount&sortOrder=asc';

    const first = await request(server)
      .get(`${endpoint}?${query}&page=1`)
      .set('x-user-id', managerId)
      .expect(200);

    const page1 = first.body as ExpensePage;

    expect(page1.data.map((item) => item.amount)).toEqual(['0.10']);
    expect(page1.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });

    const second = await request(server)
      .get(`${endpoint}?${query}&page=2`)
      .set('x-user-id', managerId)
      .expect(200);

    const page2 = second.body as ExpensePage;

    expect(page2.data.map((item) => item.amount)).toEqual(['0.20']);
    expect(page2.meta.total).toBe(2);
  });

  it('enforces assigned-project read access and read-only manager rights', async () => {
    const assigned = await createProject();
    const unassigned = await createProject(otherManagerId);

    const foreignExpense = await prisma.expense.create({
      data: {
        projectId: unassigned.id,
        recordedById: accountantId,
        amount: new Prisma.Decimal('25.00'),
        expenseDate: new Date(expenseDate),
      },
    });

    await request(server)
      .get(`/projects/${assigned.id}/expenses`)
      .set('x-user-id', managerId)
      .expect(200);

    await request(server)
      .get(`/projects/${unassigned.id}/expenses`)
      .set('x-user-id', managerId)
      .expect(403);

    await request(server)
      .get(`/projects/${unassigned.id}/expenses/summary`)
      .set('x-user-id', managerId)
      .expect(403);

    await request(server)
      .get(`/expenses/${foreignExpense.id}`)
      .set('x-user-id', managerId)
      .expect(403);

    await request(server)
      .post(`/projects/${assigned.id}/expenses`)
      .set('x-user-id', managerId)
      .send({ amount: '10.00', expenseDate })
      .expect(403);

    await request(server)
      .patch(`/expenses/${foreignExpense.id}`)
      .set('x-user-id', managerId)
      .send({ amount: '10.00' })
      .expect(403);
  });

  it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
    'prevents writes in %s projects while preserving reads',
    async (status) => {
      const project = await createProject();

      const persisted = await prisma.expense.create({
        data: {
          projectId: project.id,
          recordedById: accountantId,
          amount: new Prisma.Decimal('12.50'),
          expenseDate: new Date(expenseDate),
        },
      });

      await prisma.project.update({
        where: { id: project.id },
        data: { status },
      });

      await request(server)
        .post(`/projects/${project.id}/expenses`)
        .set('x-user-id', accountantId)
        .send({ amount: '1.00', expenseDate })
        .expect(409);

      await request(server)
        .patch(`/expenses/${persisted.id}`)
        .set('x-user-id', accountantId)
        .send({ amount: '1.00' })
        .expect(409);

      await request(server)
        .delete(`/expenses/${persisted.id}`)
        .set('x-user-id', adminId)
        .expect(409);

      await request(server)
        .get(`/projects/${project.id}/expenses/summary`)
        .set('x-user-id', accountantId)
        .expect(200);

      const unchanged = await prisma.expense.findUniqueOrThrow({
        where: { id: persisted.id },
      });

      expect(unchanged.amount.toFixed(2)).toBe('12.50');
    },
  );

  it.each(['0.00', '-1.00', '1.234', '10000000000.00'])(
    'rejects invalid monetary input %s',
    async (amount) => {
      const project = await createProject();

      await request(server)
        .post(`/projects/${project.id}/expenses`)
        .set('x-user-id', accountantId)
        .send({ amount, expenseDate })
        .expect(400);

      expect(
        await prisma.expense.count({
          where: { projectId: project.id },
        }),
      ).toBe(0);
    },
  );

  it.each(['2026-09-30T00:00:00.000Z', '2026-12-01T00:00:00.000Z'])(
    'rejects expenses outside the project date bounds: %s',
    async (date) => {
      const project = await createProject();

      const response = await request(server)
        .post(`/projects/${project.id}/expenses`)
        .set('x-user-id', accountantId)
        .send({ amount: '10.00', expenseDate: date })
        .expect(400);

      expect((response.body as { code: string }).code).toBe(
        ErrorCode.EXPENSE_INVALID_DATE_RANGE,
      );

      expect(
        await prisma.expense.count({
          where: { projectId: project.id },
        }),
      ).toBe(0);
    },
  );

  it('accepts expenses after the start date when no end date exists', async () => {
    const project = await createProject();

    await prisma.project.update({
      where: { id: project.id },
      data: { endDate: null },
    });

    await request(server)
      .post(`/projects/${project.id}/expenses`)
      .set('x-user-id', accountantId)
      .send({
        amount: '10.00',
        expenseDate: '2027-01-15T00:00:00.000Z',
      })
      .expect(201);

    expect(
      await prisma.expense.count({
        where: { projectId: project.id },
      }),
    ).toBe(1);
  });

  it('keeps concurrent expense inserts atomic', async () => {
    const project = await createProject();

    const requests = ['15.10', '15.20'].map((amount) =>
      request(server)
        .post(`/projects/${project.id}/expenses`)
        .set('x-user-id', accountantId)
        .send({ amount, expenseDate }),
    );

    const responses = await Promise.all(requests);

    expect(responses.some((response) => response.status === 201)).toBe(true);

    for (const response of responses) {
      expect([201, 409]).toContain(response.status);
    }

    const saved = await prisma.expense.findMany({
      where: { projectId: project.id },
    });

    expect(saved).toHaveLength(
      responses.filter((response) => response.status === 201).length,
    );
  });

  it('rejects inactive or missing actors and missing resources', async () => {
    const project = await createProject();

    await request(server)
      .post(`/projects/${project.id}/expenses`)
      .send({ amount: '10.00', expenseDate })
      .expect(401);

    await request(server)
      .post(`/projects/${project.id}/expenses`)
      .set('x-user-id', inactiveAccountantId)
      .send({ amount: '10.00', expenseDate })
      .expect(403);

    await request(server)
      .get(`/projects/${randomUUID()}/expenses`)
      .set('x-user-id', accountantId)
      .expect(404);

    await request(server)
      .get(`/expenses/${randomUUID()}`)
      .set('x-user-id', adminId)
      .expect(404);
  });
});
