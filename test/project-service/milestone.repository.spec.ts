import { Prisma, MilestoneStatus } from '@prisma/client';
import { MilestoneRepository } from '../../apps/project-service/src/repositories/milestone.repository';
import type { ProjectTransaction } from '../../apps/project-service/src/repositories/project.repository';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  $transaction: jest.fn(),
  project: {
    findUnique: jest.fn(),
  },
  milestone: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockTx = {
  $queryRaw: jest.fn(),
  project: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  milestone: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const transactionClient = mockTx as unknown as ProjectTransaction;

describe('MilestoneRepository', () => {
  let repository: MilestoneRepository;

  beforeEach(() => {
    jest.clearAllMocks();

    repository = new MilestoneRepository(
      mockPrisma as unknown as PrismaService,
    );

    mockPrisma.$transaction.mockImplementation(
      (work: (tx: ProjectTransaction) => Promise<unknown>) =>
        work(transactionClient),
    );
  });

  it('runs operations in a serializable transaction', async () => {
    const result = await repository.transaction((tx) => {
      expect(tx).toBe(transactionClient);
      return Promise.resolve('completed');
    });

    expect(result).toBe('completed');
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('locks the specified project row for update', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: 'project-1' }]);

    const result = await repository.lockProject(transactionClient, 'project-1');

    expect(result).toEqual([{ id: 'project-1' }]);

    const call = mockTx.$queryRaw.mock.calls[0] as unknown[];
    const sqlParts = call[0] as TemplateStringsArray;

    expect(sqlParts.join(' ')).toContain('FOR UPDATE');
    expect(call[1]).toBe('project-1');
  });

  it('reads the project fields needed for authorization', async () => {
    const project = {
      id: 'project-1',
      projectManagerId: 'manager-1',
    };

    mockPrisma.project.findUnique.mockResolvedValue(project);

    await expect(repository.findProject('project-1')).resolves.toEqual(project);

    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      select: {
        id: true,
        projectManagerId: true,
        startDate: true,
        endDate: true,
        status: true,
        progressPercentage: true,
      },
    });
  });

  it('reads a project inside the transaction', async () => {
    await repository.findProjectInTransaction(transactionClient, 'project-1');

    expect(mockTx.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-1' },
      }),
    );
  });

  it('reads milestone details with the parent project', async () => {
    await repository.findById('milestone-1');

    expect(mockPrisma.milestone.findUnique).toHaveBeenCalledWith({
      where: { id: 'milestone-1' },
      include: {
        project: {
          select: {
            id: true,
            projectManagerId: true,
            startDate: true,
            endDate: true,
            status: true,
            progressPercentage: true,
          },
        },
      },
    });
  });

  it('lists milestones in deterministic order', async () => {
    await repository.findByProjectId('project-1');

    expect(mockPrisma.milestone.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('reads a milestone inside the transaction', async () => {
    await repository.findByIdInTransaction(transactionClient, 'milestone-1');

    expect(mockTx.milestone.findUnique).toHaveBeenCalledWith({
      where: { id: 'milestone-1' },
    });
  });

  it('reads progress inputs for the specified project', async () => {
    await repository.findProgressInputsInTransaction(
      transactionClient,
      'project-1',
    );

    expect(mockTx.milestone.findMany).toHaveBeenCalledWith({
      where: { projectId: 'project-1' },
      select: {
        id: true,
        weight: true,
        progressPercentage: true,
        status: true,
        completedAt: true,
      },
    });
  });

  it('creates a milestone using the transaction client', async () => {
    const data = {
      projectId: 'project-1',
      milestoneName: 'Foundation',
      weight: 40,
      progressPercentage: 0,
      status: MilestoneStatus.PENDING,
    };

    await repository.createInTransaction(transactionClient, data);

    expect(mockTx.milestone.create).toHaveBeenCalledWith({
      data,
    });
  });

  it('updates a milestone using the transaction client', async () => {
    const data = {
      weight: 60,
      progressPercentage: 50,
      status: MilestoneStatus.IN_PROGRESS,
    };

    await repository.updateInTransaction(
      transactionClient,
      'milestone-1',
      data,
    );

    expect(mockTx.milestone.update).toHaveBeenCalledWith({
      where: { id: 'milestone-1' },
      data,
    });
  });

  it('deletes a milestone using the transaction client', async () => {
    await repository.deleteInTransaction(transactionClient, 'milestone-1');

    expect(mockTx.milestone.delete).toHaveBeenCalledWith({
      where: { id: 'milestone-1' },
    });
  });

  it('persists canonical project progress in the transaction', async () => {
    await repository.updateProjectProgressInTransaction(
      transactionClient,
      'project-1',
      75,
    );

    expect(mockTx.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { progressPercentage: 75 },
      select: {
        id: true,
        progressPercentage: true,
      },
    });
  });

  it('propagates errors from the transaction callback', async () => {
    const failure = new Error('Database operation failed');

    await expect(
      repository.transaction(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
