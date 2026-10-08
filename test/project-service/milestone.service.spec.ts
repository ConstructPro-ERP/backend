import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MilestoneStatus, Prisma, ProjectStatus } from '@prisma/client';
import { MilestoneService } from '../../apps/project-service/src/milestone.service';
import { ProjectAccessService } from '../../apps/project-service/src/project-access.service';
import { MilestoneRepository } from '../../apps/project-service/src/repositories/milestone.repository';
import type { ProjectTransaction } from '../../apps/project-service/src/repositories/project.repository';

const tx = {} as ProjectTransaction;

const project = {
  id: 'project-1',
  projectManagerId: 'manager-1',
  status: ProjectStatus.PLANNING,
  progressPercentage: 0,
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: null,
};

const milestone = {
  id: 'milestone-1',
  projectId: project.id,
  milestoneName: 'Foundation',
  description: null,
  dueDate: null,
  weight: 5,
  progressPercentage: 0,
  status: MilestoneStatus.PENDING,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  project,
};

const mockMilestones = {
  transaction: jest.fn(),
  lockProject: jest.fn(),
  findProject: jest.fn(),
  findProjectInTransaction: jest.fn(),
  findById: jest.fn(),
  findByProjectId: jest.fn(),
  findByIdInTransaction: jest.fn(),
  findProgressInputsInTransaction: jest.fn(),
  createInTransaction: jest.fn(),
  updateInTransaction: jest.fn(),
  deleteInTransaction: jest.fn(),
  updateProjectProgressInTransaction: jest.fn(),
};

const mockAccess = {
  resolveActor: jest.fn(),
  assertCanReadProject: jest.fn(),
  assertCanModifyProject: jest.fn(),
};

describe('MilestoneService', () => {
  let service: MilestoneService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new MilestoneService(
      mockMilestones as unknown as MilestoneRepository,
      mockAccess as unknown as ProjectAccessService,
    );

    mockAccess.resolveActor.mockResolvedValue({
      id: 'manager-1',
      role: 'PROJECT_MANAGER',
    });

    mockMilestones.transaction.mockImplementation(
      (work: (client: ProjectTransaction) => Promise<unknown>) => work(tx),
    );

    mockMilestones.lockProject.mockResolvedValue([{ id: project.id }]);
    mockMilestones.findProject.mockResolvedValue(project);
    mockMilestones.findProjectInTransaction.mockResolvedValue(project);
    mockMilestones.findById.mockResolvedValue(milestone);
    mockMilestones.findByIdInTransaction.mockResolvedValue(milestone);
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([]);
    mockMilestones.createInTransaction.mockResolvedValue(milestone);
    mockMilestones.updateInTransaction.mockResolvedValue(milestone);
    mockMilestones.deleteInTransaction.mockResolvedValue(milestone);
  });

  it('creates a milestone inside a transaction', async () => {
    await service.create(project.id, {
      milestoneName: 'Foundation',
      weight: 5,
    });

    expect(mockMilestones.lockProject).toHaveBeenCalledWith(tx, project.id);

    expect(mockAccess.assertCanModifyProject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'manager-1',
      }),
      project,
    );

    expect(mockMilestones.createInTransaction).toHaveBeenCalledTimes(1);
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 0);
  });

  it('calculates weighted progress using relative weights', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([
      { weight: 5, progressPercentage: 100 },
      { weight: 3, progressPercentage: 50 },
      { weight: 2, progressPercentage: 0 },
    ]);

    await service.create(project.id, {
      milestoneName: 'Finishing',
      weight: 2,
    });

    // (5 * 100 + 3 * 50 + 2 * 0) / 10 = 65
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 65);
  });

  it('normalizes progress using the total relative weight', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([
      { weight: 2, progressPercentage: 50 },
      { weight: 3, progressPercentage: 100 },
    ]);

    await service.create(project.id, {
      milestoneName: 'New Work',
      weight: 2,
    });

    // (2 * 50 + 3 * 100) / 5 = 80
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 80);
  });

  it('allows combined relative weights exceeding 100', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        weight: 10,
        progressPercentage: index === 0 ? 100 : 0,
      })),
    );

    await service.create(project.id, {
      milestoneName: 'Additional Work',
      weight: 10,
    });

    // Total weight = 110
    // Weighted progress = 1000 / 110
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 1000 / 110);
  });

  it.each([0, -1, 11, 2.5])(
    'rejects invalid creation weight %s',
    async (weight) => {
      await expect(
        service.create(project.id, {
          milestoneName: 'Foundation',
          weight,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockMilestones.createInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([0, 11, 2.5])('rejects invalid update weight %s', async (weight) => {
    await expect(service.update(milestone.id, { weight })).rejects.toThrow(
      BadRequestException,
    );

    expect(mockMilestones.updateInTransaction).not.toHaveBeenCalled();
  });

  it('marks a milestone completed with 100% progress', async () => {
    await service.updateProgress(milestone.id, {
      progressPercentage: 75,
      status: MilestoneStatus.COMPLETED,
    });

    const call = mockMilestones.updateInTransaction.mock.calls[0] as unknown[];
    const data = call[2] as {
      progressPercentage: number;
      status: MilestoneStatus;
      completedAt: Date | null;
    };

    expect(data.progressPercentage).toBe(100);
    expect(data.status).toBe(MilestoneStatus.COMPLETED);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('clears completedAt when reopening a milestone', async () => {
    mockMilestones.findByIdInTransaction.mockResolvedValue({
      ...milestone,
      progressPercentage: 100,
      status: MilestoneStatus.COMPLETED,
      completedAt: new Date('2026-09-01T00:00:00Z'),
    });

    await service.updateProgress(milestone.id, {
      progressPercentage: 50,
      status: MilestoneStatus.IN_PROGRESS,
    });

    const call = mockMilestones.updateInTransaction.mock.calls[0] as unknown[];
    const data = call[2] as {
      completedAt: Date | null;
      status: MilestoneStatus;
    };

    expect(data.completedAt).toBeNull();
    expect(data.status).toBe(MilestoneStatus.IN_PROGRESS);
  });

  it('rejects inconsistent PENDING status and progress', async () => {
    await expect(
      service.updateProgress(milestone.id, {
        progressPercentage: 50,
        status: MilestoneStatus.PENDING,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockMilestones.updateInTransaction).not.toHaveBeenCalled();
  });

  it('rejects writes by unauthorized project managers', async () => {
    mockAccess.assertCanModifyProject.mockImplementation(() => {
      throw new ForbiddenException('Access denied');
    });

    await expect(
      service.create(project.id, {
        milestoneName: 'Foundation',
        weight: 5,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(mockMilestones.createInTransaction).not.toHaveBeenCalled();
  });

  it('rejects writes to completed projects', async () => {
    mockMilestones.findProjectInTransaction.mockResolvedValue({
      ...project,
      status: ProjectStatus.COMPLETED,
    });

    await expect(
      service.create(project.id, {
        milestoneName: 'Foundation',
        weight: 5,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns 404 for missing milestones', async () => {
    mockMilestones.findById.mockResolvedValue(null);

    await expect(service.findOne('missing-milestone')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('derives delayed status without changing stored status', async () => {
    mockMilestones.findById.mockResolvedValue({
      ...milestone,
      dueDate: new Date('2020-01-01T00:00:00Z'),
    });

    const result = await service.findOne(milestone.id);

    expect(result.isDelayed).toBe(true);
    expect(result.status).toBe(MilestoneStatus.PENDING);
  });

  it('does not mark completed milestones as delayed', async () => {
    mockMilestones.findById.mockResolvedValue({
      ...milestone,
      status: MilestoneStatus.COMPLETED,
      dueDate: new Date('2020-01-01T00:00:00Z'),
    });

    const result = await service.findOne(milestone.id);

    expect(result.isDelayed).toBe(false);
  });

  it('deletes a milestone and recalculates project progress', async () => {
    await service.remove(milestone.id);

    expect(mockMilestones.deleteInTransaction).toHaveBeenCalledWith(
      tx,
      milestone.id,
    );

    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 0);
  });

  it('retries serialization conflicts', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Transaction write conflict',
      {
        code: 'P2034',
        clientVersion: '7.10.0',
      },
    );

    mockMilestones.transaction
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(conflict);

    await service.create(project.id, {
      milestoneName: 'Foundation',
      weight: 5,
    });

    expect(mockMilestones.transaction).toHaveBeenCalledTimes(3);
  });
});
