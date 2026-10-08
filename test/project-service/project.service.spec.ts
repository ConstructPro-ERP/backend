import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
  QuotationStatus,
  UserStatus,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from '../../apps/project-service/src/project.service';
import {
  ProjectRepository,
  ProjectTransaction,
} from '../../apps/project-service/src/repositories/project.repository';
import { ProjectAccessService } from '../../apps/project-service/src/project-access.service';
import { ProjectAccessActor } from '../../apps/project-service/src/interfaces/project-access.interface';
import { ProjectLifecycleService } from '../../apps/project-service/src/lifecycle/project-lifecycle.service';
import {
  ProjectSortField,
  SortOrder,
} from '../../apps/project-service/src/dto/project-query.dto';
import { ErrorCode } from '../../shared/error-codes';

const mockProjectRepository = {
  create: jest.fn(),
  findManyAndCount: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findDeletionDetails: jest.fn(),
  findProjectManagerCandidate: jest.fn(),
  findApprovedQuotation: jest.fn(),
  transaction: jest.fn(),
  lockQuotation: jest.fn(),
  lockProject: jest.fn(),
  findQuotation: jest.fn(),
  findProjectInTransaction: jest.fn(),
  findApprovedQuotationInTransaction: jest.fn(),
  findMilestonesForCompletionInTransaction: jest.fn(),
  createInTransaction: jest.fn(),
  updateInTransaction: jest.fn(),
  linkQuotation: jest.fn(),
  findProjectManagerCandidateInTransaction: jest.fn(),
};

const mockProjectAccessService = {
  resolveActor: jest.fn(),
  assertCanReadProject: jest.fn(),
  assertCanModifyProject: jest.fn(),
  assertCanCreateProject: jest.fn(),
  assertCanAssignProjectManager: jest.fn(),
  assertCanDeleteProject: jest.fn(),
};

const mockProjectLifecycleService = {
  assertTransitionAllowed: jest.fn(),
};

const fakeTransaction = {} as ProjectTransaction;

const activeManager = {
  id: 'manager-1',
  fullName: 'Project Manager',
  email: 'manager@test.com',
  status: UserStatus.ACTIVE,
  role: {
    roleName: 'PROJECT_MANAGER',
  },
};

const inactiveManager = {
  ...activeManager,
  status: UserStatus.INACTIVE,
};

const adminUser = {
  id: 'admin-1',
  status: UserStatus.ACTIVE,
  role: {
    roleName: 'ADMIN',
  },
};

const planningProject = {
  id: 'project-1',
  projectName: 'House Project',
  location: 'Colombo',
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: null,
  budget: 10000000,
  projectManagerId: 'manager-1',
  status: ProjectStatus.PLANNING,
  progressPercentage: 0,
  createdAt: new Date('2026-09-15T00:00:00.000Z'),
  updatedAt: new Date('2026-09-15T00:00:00.000Z'),
  projectManager: {
    id: 'manager-1',
    fullName: 'Project Manager',
    email: 'manager@test.com',
    status: UserStatus.ACTIVE,
  },
  quotations: [],
};

const activeProject = {
  ...planningProject,
  status: ProjectStatus.ACTIVE,
};

function createNeonSerializationConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`',
    {
      code: 'P2010',
      clientVersion: '7.10.0',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: '40001',
            originalMessage:
              'could not serialize access due to concurrent update',
            kind: 'TransactionWriteConflict',
          },
        },
      },
    },
  );
}

function createPrismaTransactionConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction failed due to a write conflict',
    {
      code: 'P2034',
      clientVersion: '7.10.0',
    },
  );
}

function createDirectSqlStateSerializationConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Raw query failed with SQLSTATE 40001',
    {
      code: 'P2010',
      clientVersion: '7.10.0',
      meta: {
        code: '40001',
      },
    },
  );
}

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: ProjectRepository,
          useValue: mockProjectRepository,
        },
        {
          provide: ProjectAccessService,
          useValue: mockProjectAccessService,
        },
        {
          provide: ProjectLifecycleService,
          useValue: mockProjectLifecycleService,
        },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);

    mockProjectAccessService.resolveActor.mockResolvedValue({
      id: 'admin-1',
      role: 'ADMIN',
    });

    mockProjectRepository.transaction.mockImplementation(
      (work: (tx: ProjectTransaction) => Promise<unknown>) =>
        work(fakeTransaction),
    );

    mockProjectRepository.lockQuotation.mockResolvedValue([
      { id: 'quotation-1' },
    ]);

    mockProjectRepository.lockProject.mockResolvedValue([{ id: 'project-1' }]);

    mockProjectRepository.findProjectInTransaction.mockResolvedValue(
      planningProject,
    );

    mockProjectRepository.findProjectManagerCandidate.mockResolvedValue(
      activeManager,
    );

    mockProjectRepository.findProjectManagerCandidateInTransaction.mockResolvedValue(
      activeManager,
    );

    mockProjectRepository.findApprovedQuotation.mockResolvedValue(null);

    mockProjectRepository.findApprovedQuotationInTransaction.mockResolvedValue(
      null,
    );

    mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
      [],
    );
  });

  describe('create', () => {
    it('creates a standalone project in PLANNING status', async () => {
      mockProjectRepository.create.mockResolvedValue(planningProject);

      const result = await service.create({
        projectName: 'House Project',
        location: 'Colombo',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2027-04-30T00:00:00.000Z',
        budget: 10000000,
        projectManagerId: 'manager-1',
      });

      expect(mockProjectRepository.create).toHaveBeenCalledWith({
        projectName: 'House Project',
        location: 'Colombo',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2027-04-30T00:00:00.000Z'),
        budget: 10000000,
        projectManagerId: 'manager-1',
        status: ProjectStatus.PLANNING,
      });

      expect(result.status).toBe(ProjectStatus.PLANNING);
    });

    it('rejects project creation with a non-Project-Manager user', async () => {
      mockProjectRepository.findProjectManagerCandidate.mockResolvedValue(
        adminUser,
      );

      await expect(
        service.create({
          projectName: 'House Project',
          startDate: '2026-10-01T00:00:00.000Z',
          projectManagerId: 'admin-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_PROJECT_MANAGER_ROLE',
        },
      });

      expect(mockProjectRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('rejects ACTIVE when no approved quotation exists', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.findApprovedQuotationInTransaction.mockResolvedValue(
        null,
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTIVATION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(mockProjectRepository.lockProject).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
      );

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('allows ACTIVE when an APPROVED quotation exists', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.findApprovedQuotationInTransaction.mockResolvedValue(
        {
          id: 'quotation-1',
          status: QuotationStatus.APPROVED,
        },
      );

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.ACTIVE,
      });

      expect(mockProjectRepository.lockProject).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
      );

      expect(
        mockProjectRepository.findProjectManagerCandidateInTransaction,
      ).toHaveBeenCalledWith(fakeTransaction, 'manager-1');

      expect(
        mockProjectRepository.findApprovedQuotationInTransaction,
      ).toHaveBeenCalledWith(fakeTransaction, 'project-1');

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.ACTIVE,
        },
      );

      expect(
        mockProjectLifecycleService.assertTransitionAllowed,
      ).toHaveBeenCalledWith(ProjectStatus.PLANNING, ProjectStatus.ACTIVE);

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('allows ACTIVE when a CONVERTED quotation exists', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.findApprovedQuotationInTransaction.mockResolvedValue(
        {
          id: 'quotation-1',
          status: QuotationStatus.CONVERTED,
        },
      );

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.ACTIVE,
      });

      expect(
        mockProjectRepository.findApprovedQuotationInTransaction,
      ).toHaveBeenCalledWith(fakeTransaction, 'project-1');

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.ACTIVE,
        },
      );

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('rejects activation when no Project Manager is assigned', async () => {
      const projectWithoutManager = {
        ...planningProject,
        projectManagerId: null,
      };

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        projectWithoutManager,
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTIVATION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(
        mockProjectRepository.findProjectManagerCandidateInTransaction,
      ).not.toHaveBeenCalled();

      expect(
        mockProjectRepository.findApprovedQuotationInTransaction,
      ).not.toHaveBeenCalled();

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects activation when the Project start date is missing', async () => {
      const projectWithoutStartDate = {
        ...planningProject,
        startDate: null,
      };

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        projectWithoutStartDate,
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTIVATION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(
        mockProjectRepository.findProjectManagerCandidateInTransaction,
      ).not.toHaveBeenCalled();

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects activation when the assigned Project Manager is inactive', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.findProjectManagerCandidateInTransaction.mockResolvedValue(
        inactiveManager,
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_MANAGER_INACTIVE,
        },
      });

      expect(
        mockProjectRepository.findApprovedQuotationInTransaction,
      ).not.toHaveBeenCalled();

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects activation when the stored Project date range is invalid', async () => {
      const projectWithInvalidDates = {
        ...planningProject,
        startDate: new Date('2026-10-10T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
      };

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        projectWithInvalidDates,
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_PROJECT_DATE_RANGE,
        },
      });

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('updates an allowed non-ACTIVE transition without checking quotations', async () => {
      const onHoldProject = {
        ...activeProject,
        status: ProjectStatus.ON_HOLD,
      };

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        onHoldProject,
      );

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.ON_HOLD,
      });

      expect(
        mockProjectLifecycleService.assertTransitionAllowed,
      ).toHaveBeenCalledWith(ProjectStatus.ACTIVE, ProjectStatus.ON_HOLD);

      expect(
        mockProjectRepository.findApprovedQuotationInTransaction,
      ).not.toHaveBeenCalled();

      expect(
        mockProjectRepository.findMilestonesForCompletionInTransaction,
      ).not.toHaveBeenCalled();

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.ON_HOLD,
        },
      );

      expect(result.status).toBe(ProjectStatus.ON_HOLD);
    });

    it('rejects completion when project progress is below 100', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue({
        ...activeProject,
        progressPercentage: 80,
      });

      mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
        [
          {
            id: 'milestone-1',
            status: 'IN_PROGRESS',
            progressPercentage: 80,
            completedAt: null,
          },
        ],
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_COMPLETION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects completion when no milestones exist', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue({
        ...activeProject,
        progressPercentage: 100,
      });

      mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
        [],
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_COMPLETION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects completion when any milestone is incomplete', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue({
        ...activeProject,
        progressPercentage: 100,
      });

      mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
        [
          {
            id: 'milestone-1',
            status: 'COMPLETED',
            progressPercentage: 100,
            completedAt: new Date(),
          },
          {
            id: 'milestone-2',
            status: 'IN_PROGRESS',
            progressPercentage: 50,
            completedAt: null,
          },
        ],
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_COMPLETION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });

    it('allows completion when all requirements are satisfied', async () => {
      const completedProject = {
        ...activeProject,
        status: ProjectStatus.COMPLETED,
        progressPercentage: 100,
      };

      mockProjectRepository.findProjectInTransaction.mockResolvedValue({
        ...activeProject,
        progressPercentage: 100,
      });

      mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
        [
          {
            id: 'milestone-1',
            status: 'COMPLETED',
            progressPercentage: 100,
            completedAt: new Date(),
          },
          {
            id: 'milestone-2',
            status: 'COMPLETED',
            progressPercentage: 100,
            completedAt: new Date(),
          },
        ],
      );

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        completedProject,
      );

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.COMPLETED,
      });

      expect(mockProjectRepository.lockProject).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
      );

      expect(
        mockProjectRepository.findMilestonesForCompletionInTransaction,
      ).toHaveBeenCalledWith(fakeTransaction, 'project-1');

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.COMPLETED,
        },
      );

      expect(result.status).toBe(ProjectStatus.COMPLETED);
      expect(result.progressPercentage).toBe(100);
    });

    it('rejects completion when a completed milestone lacks completedAt', async () => {
      mockProjectRepository.findProjectInTransaction.mockResolvedValue({
        ...activeProject,
        progressPercentage: 100,
      });

      mockProjectRepository.findMilestonesForCompletionInTransaction.mockResolvedValue(
        [
          {
            id: 'milestone-1',
            status: 'COMPLETED',
            progressPercentage: 100,
            completedAt: null,
          },
        ],
      );

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_COMPLETION_REQUIREMENTS_NOT_MET,
        },
      });

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('uses default pagination and sorting', async () => {
      mockProjectRepository.findManyAndCount.mockResolvedValue([
        [planningProject],
        1,
      ]);

      const result = await service.findAll({}, 'admin-1');

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: {
          createdAt: SortOrder.DESC,
        },
      });

      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('applies search, status, and manager filters for Admin', async () => {
      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(
        {
          search: 'Kandy',
          status: ProjectStatus.ACTIVE,
          projectManagerId: 'manager-2',
        },
        'admin-1',
      );

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectManagerId: 'manager-2',
            status: ProjectStatus.ACTIVE,
            OR: [
              {
                projectName: {
                  contains: 'Kandy',
                  mode: 'insensitive',
                },
              },
              {
                location: {
                  contains: 'Kandy',
                  mode: 'insensitive',
                },
              },
            ],
          },
        }),
      );
    });

    it('allows Accountant to filter by Project Manager', async () => {
      mockProjectAccessService.resolveActor.mockResolvedValue({
        id: 'accountant-1',
        role: 'ACCOUNTANT',
      });

      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(
        {
          projectManagerId: 'manager-2',
        },
        'accountant-1',
      );

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectManagerId: 'manager-2',
          },
        }),
      );
    });

    it('applies custom pagination and sorting', async () => {
      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 45]);

      const result = await service.findAll(
        {
          page: 3,
          limit: 20,
          sortBy: ProjectSortField.PROJECT_NAME,
          sortOrder: SortOrder.ASC,
        },
        'admin-1',
      );

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 40,
        take: 20,
        orderBy: {
          projectName: SortOrder.ASC,
        },
      });

      expect(result.meta).toEqual({
        page: 3,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
    });

    const supportedSortFields: ProjectSortField[] = [
      ProjectSortField.CREATED_AT,
      ProjectSortField.PROJECT_NAME,
      ProjectSortField.START_DATE,
    ];

    it.each(supportedSortFields)('supports sorting by %s', async (sortBy) => {
      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(
        {
          sortBy,
          sortOrder: SortOrder.ASC,
        },
        'admin-1',
      );

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            [sortBy]: SortOrder.ASC,
          },
        }),
      );
    });
  });

  describe('project access and ownership', () => {
    it('scopes Project Manager list to assigned projects', async () => {
      mockProjectAccessService.resolveActor.mockResolvedValue({
        id: 'manager-1',
        role: 'PROJECT_MANAGER',
      });

      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll({}, 'manager-1');

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectManagerId: 'manager-1',
          },
        }),
      );
    });

    it('ignores another manager ID supplied by Project Manager', async () => {
      mockProjectAccessService.resolveActor.mockResolvedValue({
        id: 'manager-1',
        role: 'PROJECT_MANAGER',
      });

      mockProjectRepository.findManyAndCount.mockResolvedValue([[], 0]);

      await service.findAll(
        {
          projectManagerId: 'manager-2',
        },
        'manager-1',
      );

      expect(mockProjectRepository.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectManagerId: 'manager-1',
          },
        }),
      );
    });

    it('checks read access for project details', async () => {
      const actor: ProjectAccessActor = {
        id: 'manager-1',
        role: 'PROJECT_MANAGER',
      };

      mockProjectAccessService.resolveActor.mockResolvedValue(actor);
      mockProjectRepository.findById.mockResolvedValue(planningProject);

      await service.findOne('project-1', 'manager-1');

      expect(
        mockProjectAccessService.assertCanReadProject,
      ).toHaveBeenCalledWith(actor, planningProject);
    });

    it('checks write access before updating project', async () => {
      const actor: ProjectAccessActor = {
        id: 'manager-1',
        role: 'PROJECT_MANAGER',
      };

      mockProjectAccessService.resolveActor.mockResolvedValue(actor);
      mockProjectRepository.findById.mockResolvedValue(planningProject);
      mockProjectRepository.update.mockResolvedValue(planningProject);

      await service.update(
        'project-1',
        {
          location: 'Kandy',
        },
        'manager-1',
      );

      expect(
        mockProjectAccessService.assertCanModifyProject,
      ).toHaveBeenCalledWith(actor, planningProject);
    });
  });

  describe('assignManager', () => {
    it('assigns an active PROJECT_MANAGER user', async () => {
      mockProjectRepository.findById.mockResolvedValue(planningProject);
      mockProjectRepository.findProjectManagerCandidate.mockResolvedValue(
        activeManager,
      );
      mockProjectRepository.update.mockResolvedValue(planningProject);

      await service.assignManager(
        'project-1',
        {
          projectManagerId: 'manager-1',
        },
        'admin-1',
      );

      expect(mockProjectRepository.update).toHaveBeenCalledWith('project-1', {
        projectManagerId: 'manager-1',
      });
    });

    it('rejects a missing project manager user', async () => {
      mockProjectRepository.findById.mockResolvedValue(planningProject);
      mockProjectRepository.findProjectManagerCandidate.mockResolvedValue(null);

      await expect(
        service.assignManager(
          'project-1',
          {
            projectManagerId: 'missing-manager',
          },
          'admin-1',
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'PROJECT_MANAGER_NOT_FOUND',
        },
      });

      expect(mockProjectRepository.update).not.toHaveBeenCalled();
    });

    it('rejects an inactive project manager', async () => {
      mockProjectRepository.findById.mockResolvedValue(planningProject);
      mockProjectRepository.findProjectManagerCandidate.mockResolvedValue(
        inactiveManager,
      );

      await expect(
        service.assignManager(
          'project-1',
          {
            projectManagerId: 'manager-1',
          },
          'admin-1',
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'PROJECT_MANAGER_INACTIVE',
        },
      });

      expect(mockProjectRepository.update).not.toHaveBeenCalled();
    });

    it.each(['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT', 'CLIENT_PORTAL_USER'])(
      'rejects user with %s role as Project Manager',
      async (roleName) => {
        mockProjectRepository.findById.mockResolvedValue(planningProject);
        mockProjectRepository.findProjectManagerCandidate.mockResolvedValue({
          ...adminUser,
          role: {
            roleName,
          },
        });

        await expect(
          service.assignManager(
            'project-1',
            {
              projectManagerId: 'invalid-manager',
            },
            'admin-1',
          ),
        ).rejects.toMatchObject({
          response: {
            code: 'INVALID_PROJECT_MANAGER_ROLE',
          },
        });

        expect(mockProjectRepository.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('remove', () => {
    const noDependencies = {
      quotations: 0,
      milestones: 0,
      tasks: 0,
      expenses: 0,
      invoices: 0,
      documents: 0,
      reports: 0,
      aiKnowledgeChunks: 0,
    };

    it('deletes an unused PLANNING project for Admin', async () => {
      mockProjectRepository.findDeletionDetails.mockResolvedValue({
        status: ProjectStatus.PLANNING,
        _count: noDependencies,
      });

      mockProjectRepository.delete.mockResolvedValue(planningProject);

      const result = await service.remove('project-1', 'admin-1');

      expect(mockProjectAccessService.resolveActor).toHaveBeenCalledWith(
        'admin-1',
      );

      expect(
        mockProjectAccessService.assertCanDeleteProject,
      ).toHaveBeenCalledWith({
        id: 'admin-1',
        role: 'ADMIN',
      });

      expect(mockProjectRepository.delete).toHaveBeenCalledWith('project-1');

      expect(result).toEqual({
        message: 'Project deleted successfully',
      });
    });

    it('rejects permanent deletion when Project is not PLANNING', async () => {
      mockProjectRepository.findDeletionDetails.mockResolvedValue({
        status: ProjectStatus.ACTIVE,
        _count: noDependencies,
      });

      await expect(
        service.remove('project-1', 'admin-1'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_DELETION_NOT_ALLOWED,
        },
      });

      expect(mockProjectRepository.delete).not.toHaveBeenCalled();
    });

    it('rejects permanent deletion when related records exist', async () => {
      mockProjectRepository.findDeletionDetails.mockResolvedValue({
        status: ProjectStatus.PLANNING,
        _count: {
          ...noDependencies,
          quotations: 1,
        },
      });

      await expect(
        service.remove('project-1', 'admin-1'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_DELETION_NOT_ALLOWED,
        },
      });

      expect(mockProjectRepository.delete).not.toHaveBeenCalled();
    });

    it('rejects permanent deletion when Project does not exist', async () => {
      mockProjectRepository.findDeletionDetails.mockResolvedValue(null);

      await expect(
        service.remove('missing-project', 'admin-1'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_NOT_FOUND,
        },
      });

      expect(mockProjectRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('createFromQuotation', () => {
    it('creates an ACTIVE project from an approved quotation', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      mockProjectRepository.createInTransaction.mockResolvedValue(
        activeProject,
      );

      mockProjectRepository.linkQuotation.mockResolvedValue({
        id: 'quotation-1',
        projectId: 'project-1',
        status: QuotationStatus.APPROVED,
      });

      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
        projectName: 'House Project',
        location: 'Colombo',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2027-04-30T00:00:00.000Z',
        projectManagerId: 'manager-1',
        budget: 10000000,
      });

      expect(mockProjectRepository.createInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        {
          projectName: 'House Project',
          location: 'Colombo',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2027-04-30T00:00:00.000Z'),
          budget: 10000000,
          projectManagerId: 'manager-1',
          status: ProjectStatus.ACTIVE,
        },
      );

      expect(mockProjectRepository.linkQuotation).toHaveBeenCalledWith(
        fakeTransaction,
        'quotation-1',
        'project-1',
      );

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });
    });

    it('attaches an approved quotation to a PLANNING project and activates it', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.linkQuotation.mockResolvedValue({
        id: 'quotation-1',
        projectId: 'project-1',
        status: QuotationStatus.APPROVED,
      });

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
        targetProjectId: 'project-1',
      });

      expect(mockProjectRepository.linkQuotation).toHaveBeenCalledWith(
        fakeTransaction,
        'quotation-1',
        'project-1',
      );

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.ACTIVE,
        },
      );

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });
    });

    it('attaches another approved quotation to an ACTIVE project without creating another project', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-2',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.createFromQuotation({
        quotationId: 'quotation-2',
        leadId: 'lead-1',
        targetProjectId: 'project-1',
      });

      expect(mockProjectRepository.linkQuotation).toHaveBeenCalledWith(
        fakeTransaction,
        'quotation-2',
        'project-1',
      );

      expect(mockProjectRepository.updateInTransaction).not.toHaveBeenCalled();

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });
    });

    it.each([
      ProjectStatus.ON_HOLD,
      ProjectStatus.COMPLETED,
      ProjectStatus.CANCELLED,
    ])(
      'preserves %s status when attaching an approved quotation',
      async (status) => {
        const existingProject = {
          ...activeProject,
          status,
        };

        mockProjectRepository.findQuotation.mockResolvedValue({
          id: 'quotation-2',
          leadId: 'lead-1',
          status: QuotationStatus.APPROVED,
          projectId: null,
        });

        mockProjectRepository.findProjectInTransaction.mockResolvedValue(
          existingProject,
        );

        const result = await service.createFromQuotation({
          quotationId: 'quotation-2',
          leadId: 'lead-1',
          targetProjectId: 'project-1',
        });

        expect(mockProjectRepository.linkQuotation).toHaveBeenCalledWith(
          fakeTransaction,
          'quotation-2',
          'project-1',
        );

        expect(
          mockProjectRepository.updateInTransaction,
        ).not.toHaveBeenCalled();

        expect(
          mockProjectRepository.createInTransaction,
        ).not.toHaveBeenCalled();

        expect(result).toEqual({
          projectId: 'project-1',
          status,
        });
      },
    );

    it('reuses the existing project when the quotation already has projectId', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
      });

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();

      expect(mockProjectRepository.linkQuotation).not.toHaveBeenCalled();

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });
    });

    it('retries when Neon reports a serialization conflict through P2010', async () => {
      // Arrange
      const serializationConflict = createNeonSerializationConflict();

      mockProjectRepository.transaction
        .mockRejectedValueOnce(serializationConflict)
        .mockImplementationOnce(
          (work: (tx: ProjectTransaction) => Promise<unknown>) =>
            work(fakeTransaction),
        );

      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      // Act
      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
      });

      // Assert
      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();
    });

    it('retries when Prisma reports a P2034 transaction conflict', async () => {
      // Arrange
      mockProjectRepository.transaction
        .mockRejectedValueOnce(createPrismaTransactionConflict())
        .mockImplementationOnce(
          (work: (tx: ProjectTransaction) => Promise<unknown>) =>
            work(fakeTransaction),
        );

      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      // Act
      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
      });

      // Assert
      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();
    });

    it('retries when P2010 exposes PostgreSQL 40001 directly in meta', async () => {
      // Arrange
      mockProjectRepository.transaction
        .mockRejectedValueOnce(createDirectSqlStateSerializationConflict())
        .mockImplementationOnce(
          (work: (tx: ProjectTransaction) => Promise<unknown>) =>
            work(fakeTransaction),
        );

      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        activeProject,
      );

      // Act
      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
      });

      // Assert
      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(2);

      expect(result).toEqual({
        projectId: 'project-1',
        status: ProjectStatus.ACTIVE,
      });
    });

    it('does not retry a non-retryable Prisma error', async () => {
      // Arrange
      const nonRetryableError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );

      mockProjectRepository.transaction.mockRejectedValue(nonRetryableError);

      // Act / Assert
      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
        }),
      ).rejects.toBe(nonRetryableError);

      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry P2010 when it is not a serialization conflict', async () => {
      // Arrange
      const nonSerializationError = new Prisma.PrismaClientKnownRequestError(
        'Raw query failed with a non-retryable database error',
        {
          code: 'P2010',
          clientVersion: '7.10.0',
          meta: {
            code: '23505',
          },
        },
      );

      mockProjectRepository.transaction.mockRejectedValue(
        nonSerializationError,
      );

      // Act / Assert
      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
        }),
      ).rejects.toBe(nonSerializationError);

      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws a concurrency conflict after three serialization failures', async () => {
      // Arrange
      mockProjectRepository.transaction.mockRejectedValue(
        createNeonSerializationConflict(),
      );

      // Act / Assert
      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PROJECT_CONVERSION_CONCURRENCY_CONFLICT',
        },
      });

      expect(mockProjectRepository.transaction).toHaveBeenCalledTimes(3);
    });

    it('activates the existing PLANNING project during retry', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(
        planningProject,
      );

      mockProjectRepository.updateInTransaction.mockResolvedValue(
        activeProject,
      );

      const result = await service.createFromQuotation({
        quotationId: 'quotation-1',
        leadId: 'lead-1',
      });

      expect(mockProjectRepository.updateInTransaction).toHaveBeenCalledWith(
        fakeTransaction,
        'project-1',
        {
          status: ProjectStatus.ACTIVE,
        },
      );

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('throws NotFoundException when quotation does not exist', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue(null);

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when leadId does not match the quotation', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'different-lead',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          targetProjectId: 'project-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'QUOTATION_LEAD_MISMATCH',
        },
      });
    });

    it('rejects a quotation that is not approved', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.PENDING_APPROVAL,
        projectId: null,
      });

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          targetProjectId: 'project-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'QUOTATION_NOT_APPROVED',
        },
      });
    });

    it('rejects a different target project when quotation already has projectId', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: 'project-1',
      });

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          targetProjectId: 'project-2',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        mockProjectRepository.findProjectInTransaction,
      ).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target project does not exist', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      mockProjectRepository.findProjectInTransaction.mockResolvedValue(null);

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          targetProjectId: 'missing-project',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockProjectRepository.linkQuotation).not.toHaveBeenCalled();
    });

    it('rejects new project creation when required project details are missing', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PROJECT_DETAILS_REQUIRED',
        },
      });

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();
    });

    it('rejects new project conversion when assigned user is not a Project Manager', async () => {
      mockProjectRepository.findQuotation.mockResolvedValue({
        id: 'quotation-1',
        leadId: 'lead-1',
        status: QuotationStatus.APPROVED,
        projectId: null,
      });

      mockProjectRepository.findProjectManagerCandidateInTransaction.mockResolvedValue(
        {
          ...adminUser,
          role: {
            roleName: 'ADMIN',
          },
        },
      );

      await expect(
        service.createFromQuotation({
          quotationId: 'quotation-1',
          leadId: 'lead-1',
          projectName: 'House Project',
          startDate: '2026-10-01T00:00:00.000Z',
          projectManagerId: 'admin-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_PROJECT_MANAGER_ROLE',
        },
      });

      expect(mockProjectRepository.createInTransaction).not.toHaveBeenCalled();
    });
  });
});
