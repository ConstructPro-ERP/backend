import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { ExpenseService } from '../../apps/project-service/src/expense.service';
import { ProjectAccessService } from '../../apps/project-service/src/project-access.service';
import {
  ExpenseRepository,
  type CreateExpenseData,
} from '../../apps/project-service/src/repositories/expense.repository';
import type { ProjectTransaction } from '../../apps/project-service/src/repositories/project.repository';

const tx = {} as ProjectTransaction;

const project = {
  id: 'project-1',
  projectManagerId: 'manager-1',
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  status: ProjectStatus.ACTIVE,
};

const expense = {
  id: 'expense-1',
  projectId: project.id,
  recordedById: 'accountant-1',
  amount: new Prisma.Decimal('12500.75'),
  category: 'MATERIAL',
  description: null,
  expenseDate: new Date('2026-10-10T00:00:00.000Z'),
  createdAt: new Date('2026-10-10T00:00:00.000Z'),
  updatedAt: new Date('2026-10-10T00:00:00.000Z'),
  project,
};

const mockExpenses = {
  transaction: jest.fn(),
  lockProject: jest.fn(),
  findProject: jest.fn(),
  findProjectInTransaction: jest.fn(),
  findById: jest.fn(),
  findByIdInTransaction: jest.fn(),
  findManyAndCount: jest.fn(),
  groupByCategory: jest.fn(),
  createInTransaction: jest.fn(),
  updateInTransaction: jest.fn(),
  deleteInTransaction: jest.fn(),
};

const mockAccess = {
  resolveActor: jest.fn(),
  assertCanReadProject: jest.fn(),
};

const validCreate = {
  amount: '12500.75',
  category: 'MATERIAL',
  expenseDate: '2026-10-10T00:00:00.000Z',
};

describe('ExpenseService', () => {
  let service: ExpenseService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new ExpenseService(
      mockExpenses as unknown as ExpenseRepository,
      mockAccess as unknown as ProjectAccessService,
      { baseDelayMs: 10, maxDelayMs: 10, maxJitterMs: 10 },
    );

    mockAccess.resolveActor.mockResolvedValue({
      id: 'accountant-1',
      role: 'ACCOUNTANT',
    });

    mockExpenses.transaction.mockImplementation(
      (work: (client: ProjectTransaction) => Promise<unknown>) => work(tx),
    );

    mockExpenses.lockProject.mockResolvedValue([{ id: project.id }]);
    mockExpenses.findProject.mockResolvedValue(project);
    mockExpenses.findProjectInTransaction.mockResolvedValue(project);
    mockExpenses.findById.mockResolvedValue(expense);
    mockExpenses.findByIdInTransaction.mockResolvedValue(expense);
    mockExpenses.findManyAndCount.mockResolvedValue([[expense], 1]);
    mockExpenses.createInTransaction.mockResolvedValue(expense);
    mockExpenses.updateInTransaction.mockResolvedValue(expense);
    mockExpenses.deleteInTransaction.mockResolvedValue(expense);
    mockExpenses.groupByCategory.mockResolvedValue([]);
  });

  it('records the authenticated Accountant as the expense creator', async () => {
    const result = await service.create(
      project.id,
      validCreate,
      'accountant-1',
    );

    const call = mockExpenses.createInTransaction.mock.calls[0] as unknown[];
    const data = call[1] as CreateExpenseData;

    expect(call[0]).toBe(tx);
    expect(data.projectId).toBe(project.id);
    expect(data.recordedById).toBe('accountant-1');
    expect(data.amount.toFixed(2)).toBe('12500.75');
    expect(data.expenseDate).toEqual(expense.expenseDate);
    expect(result.amount).toBe('12500.75');

    expect(mockExpenses.lockProject).toHaveBeenCalledWith(tx, project.id);
  });

  it('allows an Admin to create expenses', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
    });

    await service.create(project.id, validCreate, 'admin-1');

    expect(mockExpenses.createInTransaction).toHaveBeenCalledTimes(1);
  });

  it('denies expense creation to a Project Manager', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'manager-1',
      role: 'PROJECT_MANAGER',
    });

    await expect(
      service.create(project.id, validCreate, 'manager-1'),
    ).rejects.toThrow(ForbiddenException);

    expect(mockExpenses.transaction).not.toHaveBeenCalled();
  });

  it.each(['0', '-5.00', '1.234'])(
    'rejects invalid amount %s',
    async (amount) => {
      await expect(
        service.create(project.id, { ...validCreate, amount }),
      ).rejects.toThrow(BadRequestException);

      expect(mockExpenses.createInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each(['2026-09-30T00:00:00.000Z', '2027-01-01T00:00:00.000Z'])(
    'rejects expense dates outside project bounds: %s',
    async (expenseDate) => {
      await expect(
        service.create(project.id, { ...validCreate, expenseDate }),
      ).rejects.toThrow(BadRequestException);

      expect(mockExpenses.createInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
    'rejects expense writes in %s projects',
    async (status) => {
      mockExpenses.findProjectInTransaction.mockResolvedValue({
        ...project,
        status,
      });

      await expect(service.create(project.id, validCreate)).rejects.toThrow(
        ConflictException,
      );

      expect(mockExpenses.createInTransaction).not.toHaveBeenCalled();
    },
  );

  it('returns project expenses with pagination and decimal strings', async () => {
    const result = await service.findAll(
      project.id,
      {
        category: 'MATERIAL',
        page: 2,
        limit: 5,
      },
      'accountant-1',
    );

    expect(mockAccess.assertCanReadProject).toHaveBeenCalledWith(
      { id: 'accountant-1', role: 'ACCOUNTANT' },
      project,
    );

    expect(mockExpenses.findManyAndCount).toHaveBeenCalledWith({
      projectId: project.id,
      category: 'MATERIAL',
      fromDate: undefined,
      toDate: undefined,
      skip: 5,
      take: 5,
      orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
    });

    expect(result.data[0]?.amount).toBe('12500.75');
    expect(result.meta).toEqual({
      page: 2,
      limit: 5,
      total: 1,
      totalPages: 1,
    });
  });

  it('uses inclusive end-of-day filtering for date-only queries', async () => {
    await service.findAll(project.id, {
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
    });

    expect(mockExpenses.findManyAndCount).toHaveBeenCalledWith({
      projectId: project.id,
      category: undefined,
      fromDate: new Date('2026-10-01T00:00:00.000Z'),
      toDate: new Date('2026-10-31T23:59:59.999Z'),
      skip: 0,
      take: 10,
      orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
    });
  });

  it('rejects inverted date filters', async () => {
    await expect(
      service.findAll(project.id, {
        fromDate: '2026-11-01',
        toDate: '2026-10-01',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockExpenses.findManyAndCount).not.toHaveBeenCalled();
  });

  it('checks Project Manager assigned-project read authorization', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'manager-1',
      role: 'PROJECT_MANAGER',
    });

    await service.findAll(project.id, {}, 'manager-1');

    expect(mockAccess.assertCanReadProject).toHaveBeenCalledWith(
      { id: 'manager-1', role: 'PROJECT_MANAGER' },
      project,
    );
  });

  it('does not query expenses when project access is denied', async () => {
    mockAccess.assertCanReadProject.mockImplementation(() => {
      throw new ForbiddenException('Project access denied');
    });

    await expect(service.findAll(project.id, {})).rejects.toThrow(
      ForbiddenException,
    );

    expect(mockExpenses.findManyAndCount).not.toHaveBeenCalled();
  });

  it('prevents reading an unauthorized expense', async () => {
    mockAccess.assertCanReadProject.mockImplementation(() => {
      throw new ForbiddenException('Project access denied');
    });

    await expect(service.findOne(expense.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns 404 for a missing expense', async () => {
    mockExpenses.findById.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects an empty PATCH', async () => {
    await expect(service.update(expense.id, {})).rejects.toThrow(
      BadRequestException,
    );

    expect(mockExpenses.updateInTransaction).not.toHaveBeenCalled();
  });

  it('updates Decimal amounts and nullable metadata', async () => {
    await service.update(expense.id, {
      amount: '100.10',
      category: null,
      description: null,
    });

    const call = mockExpenses.updateInTransaction.mock.calls[0] as unknown[];
    const data = call[3] as {
      amount: Prisma.Decimal;
      category: null;
      description: null;
    };

    expect(call[0]).toBe(tx);
    expect(call[1]).toBe(expense.id);
    expect(call[2]).toBe(project.id);
    expect(data.amount.toFixed(2)).toBe('100.10');
    expect(data.category).toBeNull();
    expect(data.description).toBeNull();
  });

  it('denies updates to Project Managers', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'manager-1',
      role: 'PROJECT_MANAGER',
    });

    await expect(
      service.update(expense.id, { amount: '100.00' }),
    ).rejects.toThrow(ForbiddenException);

    expect(mockExpenses.updateInTransaction).not.toHaveBeenCalled();
  });

  it('checks expense ownership inside update transactions', async () => {
    mockExpenses.findByIdInTransaction.mockResolvedValue({
      ...expense,
      projectId: 'another-project',
    });

    await expect(
      service.update(expense.id, { amount: '100.00' }),
    ).rejects.toThrow(NotFoundException);

    expect(mockExpenses.updateInTransaction).not.toHaveBeenCalled();
  });

  it('allows an Admin to delete expenses', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
    });

    await expect(service.remove(expense.id)).resolves.toEqual({
      message: 'Expense deleted successfully',
    });

    expect(mockExpenses.deleteInTransaction).toHaveBeenCalledWith(
      tx,
      expense.id,
      project.id,
    );
  });

  it('denies deletion to Accountants', async () => {
    await expect(service.remove(expense.id)).rejects.toThrow(
      ForbiddenException,
    );

    expect(mockExpenses.findById).not.toHaveBeenCalled();
    expect(mockExpenses.deleteInTransaction).not.toHaveBeenCalled();
  });

  it('rejects missing expenses inside deletion transactions', async () => {
    mockAccess.resolveActor.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
    });

    mockExpenses.findByIdInTransaction.mockResolvedValue(null);

    await expect(service.remove(expense.id)).rejects.toThrow(NotFoundException);

    expect(mockExpenses.deleteInTransaction).not.toHaveBeenCalled();
  });

  it('returns exact Decimal summaries including uncategorized expenses', async () => {
    mockExpenses.groupByCategory.mockResolvedValue([
      {
        category: 'LABOUR',
        _sum: { amount: new Prisma.Decimal('0.10') },
      },
      {
        category: 'MATERIAL',
        _sum: { amount: new Prisma.Decimal('0.20') },
      },
      {
        category: null,
        _sum: { amount: new Prisma.Decimal('1.05') },
      },
    ]);

    await expect(service.summary(project.id)).resolves.toEqual({
      total: '1.35',
      byCategory: [
        { category: 'LABOUR', amount: '0.10' },
        { category: 'MATERIAL', amount: '0.20' },
        { category: null, amount: '1.05' },
      ],
    });
  });

  it('returns zero for an empty expense summary', async () => {
    await expect(service.summary(project.id)).resolves.toEqual({
      total: '0.00',
      byCategory: [],
    });
  });

  it('rejects listing expenses for missing projects', async () => {
    mockExpenses.findProject.mockResolvedValue(null);

    await expect(service.findAll('missing', {})).rejects.toThrow(
      NotFoundException,
    );

    expect(mockExpenses.findManyAndCount).not.toHaveBeenCalled();
  });

  it('retries Prisma serialization conflicts', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    });

    mockExpenses.transaction.mockRejectedValueOnce(error);

    await service.create(project.id, validCreate);

    expect(mockExpenses.transaction).toHaveBeenCalledTimes(2);
  });

  it('stops after four serialization conflicts', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Conflict', {
      code: 'P2034',
      clientVersion: '7.10.0',
    });

    mockExpenses.transaction.mockRejectedValue(error);

    await expect(service.create(project.id, validCreate)).rejects.toThrow(
      ConflictException,
    );

    expect(mockExpenses.transaction).toHaveBeenCalledTimes(4);
  });
});
