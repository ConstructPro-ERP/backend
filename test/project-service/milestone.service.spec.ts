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
  weight: 40,
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
      weight: 40,
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

  it('calculates the correct weighted project progress', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([
      { weight: 40, progressPercentage: 50 },
      { weight: 60, progressPercentage: 100 },
    ]);

    await service.create(project.id, {
      milestoneName: 'New Work',
      weight: 40,
    });

    // (40 * 50 + 60 * 100) / 100 = 80
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 80);
  });

  it('normalizes partial weights using their current total', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([
      { weight: 20, progressPercentage: 50 },
      { weight: 30, progressPercentage: 100 },
    ]);

    await service.create(project.id, {
      milestoneName: 'New Work',
      weight: 20,
    });

    // (20 * 50 + 30 * 100) / 50 = 80
    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).toHaveBeenCalledWith(tx, project.id, 80);
  });

  it('rejects total milestone weight greater than 100', async () => {
    mockMilestones.findProgressInputsInTransaction.mockResolvedValue([
      { weight: 60, progressPercentage: 0 },
      { weight: 50, progressPercentage: 0 },
    ]);

    await expect(
      service.create(project.id, {
        milestoneName: 'New Work',
        weight: 50,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(
      mockMilestones.updateProjectProgressInTransaction,
    ).not.toHaveBeenCalled();
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
        weight: 40,
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
        weight: 40,
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
      weight: 40,
    });

    expect(mockMilestones.transaction).toHaveBeenCalledTimes(3);
  });
});
