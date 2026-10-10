import { Prisma } from '@prisma/client';
import {
  ExpenseRepository,
  type CreateExpenseData,
} from '../../apps/project-service/src/repositories/expense.repository';
import type { ProjectTransaction } from '../../apps/project-service/src/repositories/project.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  project: {
    findUnique: jest.fn(),
  },
  expense: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};

const mockTx = {
  $queryRaw: jest.fn(),
  project: {
    findUnique: jest.fn(),
  },
  expense: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const transactionClient = mockTx as unknown as ProjectTransaction;

describe('ExpenseRepository', () => {
  let repository: ExpenseRepository;

  beforeEach(() => {
    jest.resetAllMocks();

    repository = new ExpenseRepository(mockPrisma as unknown as PrismaService);

    mockPrisma.$transaction.mockImplementation(
      (
        work:
          ((tx: ProjectTransaction) => Promise<unknown>) | Promise<unknown>[],
      ) => (Array.isArray(work) ? Promise.all(work) : work(transactionClient)),
    );
  });

  it('runs writes in a Serializable transaction', async () => {
    const result = await repository.transaction(() =>
      Promise.resolve('completed'),
    );

    expect(result).toBe('completed');
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('locks the parent project row', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: 'project-1' }]);

    await expect(
      repository.lockProject(transactionClient, 'project-1'),
    ).resolves.toEqual([{ id: 'project-1' }]);

    const call = mockTx.$queryRaw.mock.calls[0] as unknown[];
    const sql = call[0] as TemplateStringsArray;

    expect(sql.join(' ')).toContain('FOR UPDATE');
    expect(call[1]).toBe('project-1');
  });

  it('reads the project fields needed for validation', async () => {
    await repository.findProject('project-1');

    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      select: {
        id: true,
        projectManagerId: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
  });

  it('reads a project inside a transaction', async () => {
    await repository.findProjectInTransaction(transactionClient, 'project-1');

    expect(mockTx.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      select: {
        id: true,
        projectManagerId: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
  });

  it('retrieves expense details with the parent project', async () => {
    await repository.findById('expense-1');

    expect(mockPrisma.expense.findUnique).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
      include: {
        project: {
          select: {
            id: true,
            projectManagerId: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
      },
    });
  });

  it('reads an expense inside a transaction', async () => {
    await repository.findByIdInTransaction(transactionClient, 'expense-1');

    expect(mockTx.expense.findUnique).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
    });
  });

  it('lists project expenses with filters and pagination', async () => {
    const rows = [
      {
        id: 'expense-1',
        projectId: 'project-1',
        amount: new Prisma.Decimal('12500.75'),
      },
    ];

    mockPrisma.expense.findMany.mockResolvedValue(rows);
    mockPrisma.expense.count.mockResolvedValue(1);

    const fromDate = new Date('2026-10-01T00:00:00.000Z');
    const toDate = new Date('2026-10-31T23:59:59.999Z');
    const orderBy = [{ expenseDate: 'desc' as const }, { id: 'asc' as const }];

    await expect(
      repository.findManyAndCount({
        projectId: 'project-1',
        category: 'MATERIAL',
        fromDate,
        toDate,
        skip: 10,
        take: 10,
        orderBy,
      }),
    ).resolves.toEqual([rows, 1]);

    const where = {
      projectId: 'project-1',
      category: 'MATERIAL',
      expenseDate: {
        gte: fromDate,
        lte: toDate,
      },
    };

    expect(mockPrisma.expense.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy,
    });

    expect(mockPrisma.expense.count).toHaveBeenCalledWith({
      where,
    });
  });

  it('restricts unfiltered lists to the requested project', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);

    await repository.findManyAndCount({
      projectId: 'project-2',
      skip: 0,
      take: 10,
      orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
    });

    const where = {
      projectId: 'project-2',
      category: undefined,
      expenseDate: undefined,
    };

    expect(mockPrisma.expense.findMany).toHaveBeenCalledWith({
      where,
      skip: 0,
      take: 10,
      orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
    });

    expect(mockPrisma.expense.count).toHaveBeenCalledWith({
      where,
    });
  });

  it('groups expenses by category using Decimal totals', async () => {
    const groups = [
      {
        category: 'LABOUR',
        _sum: {
          amount: new Prisma.Decimal('200000.25'),
        },
      },
      {
        category: 'MATERIAL',
        _sum: {
          amount: new Prisma.Decimal('175000.10'),
        },
      },
    ];

    mockPrisma.expense.groupBy.mockResolvedValue(groups);

    const result = await repository.groupByCategory('project-1');

    expect(result).toEqual(groups);
    expect(mockPrisma.expense.groupBy).toHaveBeenCalledWith({
      by: ['category'],
      where: { projectId: 'project-1' },
      _sum: { amount: true },
      orderBy: { category: 'asc' },
    });

    expect(result[0]?._sum?.amount).toBeInstanceOf(Prisma.Decimal);
  });

  it('preserves nullable categories in summary results', async () => {
    const groups = [
      {
        category: null,
        _sum: {
          amount: new Prisma.Decimal('50.25'),
        },
      },
    ];

    mockPrisma.expense.groupBy.mockResolvedValue(groups);

    const result = await repository.groupByCategory('project-1');

    expect(result[0]?.category).toBeNull();
    expect(result[0]?._sum?.amount?.toFixed(2)).toBe('50.25');
  });

  it('creates an expense with its exact Decimal amount', async () => {
    const data: CreateExpenseData = {
      projectId: 'project-1',
      recordedById: 'user-1',
      amount: new Prisma.Decimal('12500.75'),
      category: 'MATERIAL',
      description: 'Foundation materials',
      expenseDate: new Date('2026-10-10T00:00:00.000Z'),
    };

    await repository.createInTransaction(transactionClient, data);

    expect(mockTx.expense.create).toHaveBeenCalledWith({
      data,
    });

    expect(data.amount.toFixed(2)).toBe('12500.75');
  });

  it('updates only allowed expense fields within its project', async () => {
    const data = {
      amount: new Prisma.Decimal('15000.50'),
      category: null,
      description: 'Updated expense',
      expenseDate: new Date('2026-10-11T00:00:00.000Z'),
    };

    await repository.updateInTransaction(
      transactionClient,
      'expense-1',
      'project-1',
      data,
    );

    expect(mockTx.expense.update).toHaveBeenCalledWith({
      where: {
        id: 'expense-1',
        projectId: 'project-1',
      },
      data,
    });
  });

  it('deletes an expense only within its parent project', async () => {
    await repository.deleteInTransaction(
      transactionClient,
      'expense-1',
      'project-1',
    );

    expect(mockTx.expense.delete).toHaveBeenCalledWith({
      where: {
        id: 'expense-1',
        projectId: 'project-1',
      },
    });
  });

  it('propagates transaction failures', async () => {
    const failure = new Error('Database operation failed');

    await expect(
      repository.transaction(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
