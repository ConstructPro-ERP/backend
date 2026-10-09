import { Prisma, TaskStatus } from '@prisma/client';
import {
  TaskRepository,
  type TaskTransaction,
} from '../../apps/task-service/src/repositories/task.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  project: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  task: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockTx = {
  $queryRaw: jest.fn(),
  project: { findUnique: jest.fn() },
  milestone: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  task: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const transactionClient = mockTx as unknown as TaskTransaction;

describe('TaskRepository', () => {
  let repository: TaskRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new TaskRepository(mockPrisma as unknown as PrismaService);

    mockPrisma.$transaction.mockImplementation(
      (
        work: ((tx: TaskTransaction) => Promise<unknown>) | Promise<unknown>[],
      ) => (Array.isArray(work) ? Promise.all(work) : work(transactionClient)),
    );
  });

  it('runs writes in a Serializable transaction', async () => {
    const result = await repository.transaction(() => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('locks the parent project', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: 'project-1' }]);

    await expect(
      repository.lockProject(transactionClient, 'project-1'),
    ).resolves.toEqual([{ id: 'project-1' }]);

    const call = mockTx.$queryRaw.mock.calls[0] as unknown[];
    const sql = call[0] as TemplateStringsArray;

    expect(sql.join(' ')).toContain('FOR UPDATE');
    expect(call[1]).toBe('project-1');
  });

  it('finds the project needed for authorization and due-date checks', async () => {
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

  it('reads project, milestone and user in a transaction', async () => {
    await repository.findProjectInTransaction(transactionClient, 'project-1');
    await repository.findMilestoneInTransaction(transactionClient, 'mile-1');
    await repository.findAssigneeInTransaction(transactionClient, 'user-1');

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

    expect(mockTx.milestone.findUnique).toHaveBeenCalledWith({
      where: { id: 'mile-1' },
      select: { id: true, projectId: true },
    });

    expect(mockTx.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, status: true },
    });
  });

  it('reads the authenticated actor and role', async () => {
    await repository.findActor('user-1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        status: true,
        role: { select: { roleName: true } },
      },
    });
  });

  it('reads tasks with the parent project or inside a transaction', async () => {
    await repository.findById('task-1');
    await repository.findByIdInTransaction(transactionClient, 'task-1');

    expect(mockPrisma.task.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-1' },
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

    expect(mockTx.task.findUnique).toHaveBeenCalledWith({
      where: { id: 'task-1' },
    });
  });

  it('retrieves a filtered page and its total count', async () => {
    const tasks = [{ id: 'task-1' }];

    mockPrisma.task.findMany.mockResolvedValue(tasks);
    mockPrisma.task.count.mockResolvedValue(1);

    const where = {
      projectId: 'project-1',
      status: TaskStatus.TODO,
    };
    const orderBy = [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

    await expect(
      repository.findManyAndCount({
        where,
        skip: 10,
        take: 10,
        orderBy,
      }),
    ).resolves.toEqual([tasks, 1]);

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy,
    });

    expect(mockPrisma.task.count).toHaveBeenCalledWith({ where });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates tasks inside transactions', async () => {
    const data = {
      projectId: 'project-1',
      taskName: 'Foundation',
      dueDate: new Date('2026-12-31T00:00:00.000Z'),
      status: TaskStatus.TODO,
    };

    await repository.createInTransaction(transactionClient, data);

    expect(mockTx.task.create).toHaveBeenCalledWith({ data });
  });

  it('updates only task metadata through the generic method', async () => {
    const data = {
      taskName: 'Updated',
      description: null,
      milestoneId: null,
    };

    await repository.updateInTransaction(transactionClient, 'task-1', data);

    expect(mockTx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data,
    });
  });

  it('updates status through the dedicated method', async () => {
    await repository.updateStatusInTransaction(
      transactionClient,
      'task-1',
      TaskStatus.BLOCKED,
    );

    expect(mockTx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: TaskStatus.BLOCKED },
    });
  });

  it('assigns a user through the dedicated method', async () => {
    await repository.assignInTransaction(transactionClient, 'task-1', 'user-1');

    expect(mockTx.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { assignedToId: 'user-1' },
    });
  });

  it('deletes a task inside a transaction', async () => {
    await repository.deleteInTransaction(transactionClient, 'task-1');

    expect(mockTx.task.delete).toHaveBeenCalledWith({
      where: { id: 'task-1' },
    });
  });

  it('propagates transaction failures', async () => {
    const error = new Error('Database error');

    await expect(
      repository.transaction(() => Promise.reject(error)),
    ).rejects.toBe(error);
  });
});
