import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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

const mockProjectRepository = {
  create: jest.fn(),
  findManyAndCount: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  getDependencyCounts: jest.fn(),
  findProjectManager: jest.fn(),
  findApprovedQuotation: jest.fn(),
  transaction: jest.fn(),
  lockQuotation: jest.fn(),
  findQuotation: jest.fn(),
  findProjectInTransaction: jest.fn(),
  createInTransaction: jest.fn(),
  updateInTransaction: jest.fn(),
  linkQuotation: jest.fn(),
  findProjectManagerInTransaction: jest.fn(),
};

const mockProjectAccessService = {
  resolveActor: jest.fn(),
  assertCanReadProject: jest.fn(),
  assertCanModifyProject: jest.fn(),
  assertCanCreateProject: jest.fn(),
  assertCanAssignProjectManager: jest.fn(),
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

    mockProjectRepository.findProjectManager.mockResolvedValue(activeManager);

    mockProjectRepository.findProjectManagerInTransaction.mockResolvedValue(
      activeManager,
    );

    mockProjectRepository.findApprovedQuotation.mockResolvedValue(null);
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
      mockProjectRepository.findProjectManager.mockResolvedValue(adminUser);

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
      mockProjectRepository.findById.mockResolvedValue(planningProject);

      mockProjectRepository.findApprovedQuotation.mockResolvedValue(null);

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.ACTIVE,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockProjectRepository.update).not.toHaveBeenCalled();
    });

    it('allows ACTIVE when an APPROVED quotation exists', async () => {
      mockProjectRepository.findById.mockResolvedValue(planningProject);

      mockProjectRepository.findApprovedQuotation.mockResolvedValue({
        id: 'quotation-1',
        status: QuotationStatus.APPROVED,
      });

      mockProjectRepository.update.mockResolvedValue(activeProject);

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.ACTIVE,
      });

      expect(mockProjectRepository.update).toHaveBeenCalledWith('project-1', {
        status: ProjectStatus.ACTIVE,
      });

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('allows ACTIVE when a CONVERTED quotation exists', async () => {
      mockProjectRepository.findById.mockResolvedValue(planningProject);

      mockProjectRepository.findApprovedQuotation.mockResolvedValue({
        id: 'quotation-1',
        status: QuotationStatus.CONVERTED,
      });

      mockProjectRepository.update.mockResolvedValue(activeProject);

      const result = await service.updateStatus('project-1', {
        status: ProjectStatus.ACTIVE,
      });

      expect(result.status).toBe(ProjectStatus.ACTIVE);
    });

    it('rejects PLANNING when an approved quotation already exists', async () => {
      mockProjectRepository.findById.mockResolvedValue(activeProject);

      mockProjectRepository.findApprovedQuotation.mockResolvedValue({
        id: 'quotation-1',
        status: QuotationStatus.APPROVED,
      });

      await expect(
        service.updateStatus('project-1', {
          status: ProjectStatus.PLANNING,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockProjectRepository.update).not.toHaveBeenCalled();
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
      mockProjectRepository.findProjectManager.mockResolvedValue(activeManager);
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
      mockProjectRepository.findProjectManager.mockResolvedValue(null);

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
      mockProjectRepository.findProjectManager.mockResolvedValue(
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
        mockProjectRepository.findProjectManager.mockResolvedValue({
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
  });

  it('rejects new project conversion when assigned user is not a Project Manager', async () => {
    mockProjectRepository.findQuotation.mockResolvedValue({
      id: 'quotation-1',
      leadId: 'lead-1',
      status: QuotationStatus.APPROVED,
      projectId: null,
    });

    mockProjectRepository.findProjectManagerInTransaction.mockResolvedValue({
      ...adminUser,
      role: {
        roleName: 'ADMIN',
      },
    });

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
