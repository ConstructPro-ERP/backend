import { Prisma, ProjectStatus, TaskStatus, UserStatus } from '@prisma/client';
import { TaskService } from '../../apps/task-service/src/task.service';
import {
  TaskSortField,
  TaskSortOrder,
} from '../../apps/task-service/src/dto/task-query.dto';
import { TaskRepository } from '../../apps/task-service/src/repositories/task.repository';
import type { TaskTransaction } from '../../apps/task-service/src/repositories/task.repository';
import { ErrorCode } from '../../shared/error-codes';

const project = {
  id: 'project-1',
  projectManagerId: 'manager-1',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  status: ProjectStatus.ACTIVE,
};

const task = {
  id: 'task-1',
  projectId: project.id,
  milestoneId: null,
  assignedToId: null,
  taskName: 'Foundation',
  description: null,
  dueDate: null,
  status: TaskStatus.TODO,
};

const manager = {
  id: 'manager-1',
  status: UserStatus.ACTIVE,
  role: { roleName: 'PROJECT_MANAGER' },
};

const admin = {
  id: 'admin-1',
  status: UserStatus.ACTIVE,
  role: { roleName: 'ADMIN' },
};

const accountant = {
  id: 'accountant-1',
  status: UserStatus.ACTIVE,
  role: { roleName: 'ACCOUNTANT' },
};

const mockTasks = {
  transaction: jest.fn(),
  lockProject: jest.fn(),
  findProject: jest.fn(),
  findProjectInTransaction: jest.fn(),
  findMilestoneInTransaction: jest.fn(),
  findAssigneeInTransaction: jest.fn(),
  findActor: jest.fn(),
  findById: jest.fn(),
  findByIdInTransaction: jest.fn(),
  findManyAndCount: jest.fn(),
  createInTransaction: jest.fn(),
  updateInTransaction: jest.fn(),
  updateStatusInTransaction: jest.fn(),
  assignInTransaction: jest.fn(),
  deleteInTransaction: jest.fn(),
};

const tx = {} as TaskTransaction;
const createDto = {
  projectId: project.id,
  taskName: 'Foundation',
};

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new TaskService(mockTasks as unknown as TaskRepository, {
      baseDelayMs: 0,
      maxDelayMs: 0,
      maxJitterMs: 0,
    });

    mockTasks.findActor.mockResolvedValue(manager);
    mockTasks.findProject.mockResolvedValue(project);
    mockTasks.findProjectInTransaction.mockResolvedValue(project);
    mockTasks.findById.mockResolvedValue({ ...task, project });
    mockTasks.findByIdInTransaction.mockResolvedValue(task);
    mockTasks.lockProject.mockResolvedValue([{ id: project.id }]);

    mockTasks.transaction.mockImplementation(
      (work: (client: TaskTransaction) => Promise<unknown>) => work(tx),
    );

    mockTasks.findMilestoneInTransaction.mockResolvedValue({
      id: 'milestone-1',
      projectId: project.id,
    });

    mockTasks.findAssigneeInTransaction.mockResolvedValue({
      id: 'user-1',
      status: UserStatus.ACTIVE,
    });

    mockTasks.findManyAndCount.mockResolvedValue([[task], 1]);
    mockTasks.createInTransaction.mockResolvedValue(task);
    mockTasks.updateInTransaction.mockResolvedValue(task);
    mockTasks.updateStatusInTransaction.mockResolvedValue(task);
    mockTasks.assignInTransaction.mockResolvedValue(task);
    mockTasks.deleteInTransaction.mockResolvedValue(task);
  });

  describe('Authentication and authorization', () => {
    it('rejects missing actor information', async () => {
      await expect(service.create(createDto)).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTOR_REQUIRED,
        },
      });

      expect(mockTasks.transaction).not.toHaveBeenCalled();
    });

    it('rejects an unknown actor', async () => {
      mockTasks.findActor.mockResolvedValue(null);

      await expect(
        service.create(createDto, 'unknown-user'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTOR_NOT_FOUND,
        },
      });
    });

    it('rejects inactive actors', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        status: UserStatus.INACTIVE,
      });

      await expect(service.findAll({}, manager.id)).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACTOR_INACTIVE,
        },
      });
    });

    it('rejects unsupported roles', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        role: { roleName: 'SALES_MANAGER' },
      });

      await expect(service.findAll({}, manager.id)).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACCESS_DENIED,
        },
      });
    });

    it('denies writes from unrelated Project Managers', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        id: 'other-manager',
      });

      await expect(
        service.create(createDto, 'other-manager'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACCESS_DENIED,
        },
      });

      expect(mockTasks.createInTransaction).not.toHaveBeenCalled();
    });

    it('allows administrators to create tasks', async () => {
      mockTasks.findActor.mockResolvedValue(admin);

      await service.create(createDto, admin.id);

      expect(mockTasks.createInTransaction).toHaveBeenCalledTimes(1);
    });

    it('allows accountant reads but rejects writes', async () => {
      mockTasks.findActor.mockResolvedValue(accountant);

      await expect(
        service.findOne(task.id, accountant.id),
      ).resolves.toMatchObject(task);

      await expect(
        service.create(createDto, accountant.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACCESS_DENIED,
        },
      });
    });
  });

  describe('Task creation', () => {
    it('creates a project-level task', async () => {
      await service.create(createDto, manager.id);

      expect(mockTasks.lockProject).toHaveBeenCalledWith(tx, project.id);

      expect(mockTasks.createInTransaction).toHaveBeenCalledWith(tx, {
        projectId: project.id,
        milestoneId: undefined,
        assignedToId: undefined,
        taskName: 'Foundation',
        description: undefined,
        dueDate: undefined,
        status: TaskStatus.TODO,
      });
    });

    it('creates a milestone-linked task with an active assignee', async () => {
      await service.create(
        {
          ...createDto,
          milestoneId: 'milestone-1',
          assignedToId: 'user-1',
          dueDate: '2026-06-01T00:00:00.000Z',
          status: TaskStatus.IN_PROGRESS,
        },
        manager.id,
      );

      expect(mockTasks.findMilestoneInTransaction).toHaveBeenCalledWith(
        tx,
        'milestone-1',
      );

      expect(mockTasks.findAssigneeInTransaction).toHaveBeenCalledWith(
        tx,
        'user-1',
      );

      expect(mockTasks.createInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          dueDate: new Date('2026-06-01T00:00:00.000Z'),
          status: TaskStatus.IN_PROGRESS,
        }),
      );
    });

    it('rejects missing projects', async () => {
      mockTasks.lockProject.mockResolvedValue([]);

      await expect(service.create(createDto, manager.id)).rejects.toMatchObject(
        {
          response: { code: ErrorCode.PROJECT_NOT_FOUND },
        },
      );

      expect(mockTasks.createInTransaction).not.toHaveBeenCalled();
    });

    it('rejects milestones belonging to another project', async () => {
      mockTasks.findMilestoneInTransaction.mockResolvedValue({
        id: 'milestone-1',
        projectId: 'other-project',
      });

      await expect(
        service.create(
          { ...createDto, milestoneId: 'milestone-1' },
          manager.id,
        ),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_MILESTONE_PROJECT_MISMATCH,
        },
      });
    });

    it('rejects unknown milestones', async () => {
      mockTasks.findMilestoneInTransaction.mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, milestoneId: 'unknown' }, manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_MILESTONE_NOT_FOUND,
        },
      });
    });

    it.each([null, { id: 'user-1', status: UserStatus.INACTIVE }])(
      'rejects invalid assignees (%p)',
      async (assignee) => {
        mockTasks.findAssigneeInTransaction.mockResolvedValue(assignee);

        await expect(
          service.create({ ...createDto, assignedToId: 'user-1' }, manager.id),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCode.INVALID_TASK_ASSIGNEE,
          },
        });

        expect(mockTasks.createInTransaction).not.toHaveBeenCalled();
      },
    );

    it.each(['2025-12-31T00:00:00.000Z', '2027-01-01T00:00:00.000Z'])(
      'rejects out-of-range due date %s',
      async (dueDate) => {
        await expect(
          service.create({ ...createDto, dueDate }, manager.id),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCode.INVALID_TASK_DUE_DATE,
          },
        });
      },
    );

    it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
      'rejects modifications in %s projects',
      async (status) => {
        mockTasks.findProjectInTransaction.mockResolvedValue({
          ...project,
          status,
        });

        await expect(
          service.create(createDto, manager.id),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCode.TASK_MODIFICATION_NOT_ALLOWED,
          },
        });
      },
    );
  });

  describe('Task retrieval', () => {
    it('applies ownership restrictions and list filters', async () => {
      const result = await service.findAll(
        {
          milestoneId: 'milestone-1',
          assignedToId: 'user-1',
          status: TaskStatus.BLOCKED,
          page: 2,
          limit: 5,
          sortBy: TaskSortField.DUE_DATE,
          sortOrder: TaskSortOrder.ASC,
        },
        manager.id,
      );

      expect(mockTasks.findManyAndCount).toHaveBeenCalledWith({
        where: {
          project: { projectManagerId: manager.id },
          milestoneId: 'milestone-1',
          assignedToId: 'user-1',
          status: TaskStatus.BLOCKED,
        },
        skip: 5,
        take: 5,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });

      expect(result.meta).toEqual({
        page: 2,
        limit: 5,
        total: 1,
        totalPages: 1,
      });
    });

    it('uses default pagination for administrators', async () => {
      mockTasks.findActor.mockResolvedValue(admin);

      await service.findAll({}, admin.id);

      expect(mockTasks.findManyAndCount).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    });

    it('lists tasks for a permitted project', async () => {
      await service.findByProject(
        project.id,
        { status: TaskStatus.TODO },
        manager.id,
      );

      expect(mockTasks.findManyAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId: project.id,
            project: { projectManagerId: manager.id },
            status: TaskStatus.TODO,
          },
        }),
      );
    });

    it('rejects conflicting project filters', async () => {
      await expect(
        service.findByProject(
          project.id,
          { projectId: 'other-project' },
          manager.id,
        ),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.VALIDATION_ERROR,
        },
      });
    });

    it('rejects unauthorized project-scoped lists', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        id: 'other-manager',
      });

      await expect(
        service.findByProject(project.id, {}, 'other-manager'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACCESS_DENIED,
        },
      });

      expect(mockTasks.findManyAndCount).not.toHaveBeenCalled();
    });

    it('rejects unknown project filters', async () => {
      mockTasks.findProject.mockResolvedValue(null);

      await expect(
        service.findAll({ projectId: 'missing-project' }, manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_NOT_FOUND,
        },
      });
    });

    it('rejects unknown task IDs', async () => {
      mockTasks.findById.mockResolvedValue(null);

      await expect(
        service.findOne('missing-task', manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_NOT_FOUND,
        },
      });
    });

    it('denies unrelated Project Managers reading tasks', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        id: 'other-manager',
      });

      await expect(
        service.findOne(task.id, 'other-manager'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PROJECT_ACCESS_DENIED,
        },
      });
    });
  });

  describe('Task mutations', () => {
    it('updates metadata and clears nullable fields', async () => {
      await service.update(
        task.id,
        {
          taskName: 'Revised Foundation',
          description: null,
          milestoneId: null,
          dueDate: null,
        },
        manager.id,
      );

      expect(mockTasks.updateInTransaction).toHaveBeenCalledWith(tx, task.id, {
        taskName: 'Revised Foundation',
        description: null,
        milestoneId: null,
        dueDate: null,
      });
    });

    it('rejects milestone reassignment across projects', async () => {
      mockTasks.findMilestoneInTransaction.mockResolvedValue({
        id: 'milestone-2',
        projectId: 'other-project',
      });

      await expect(
        service.update(task.id, { milestoneId: 'milestone-2' }, manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_MILESTONE_PROJECT_MISMATCH,
        },
      });

      expect(mockTasks.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects invalid due dates during updates', async () => {
      await expect(
        service.update(
          task.id,
          { dueDate: '2027-01-01T00:00:00.000Z' },
          manager.id,
        ),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_TASK_DUE_DATE,
        },
      });

      expect(mockTasks.updateInTransaction).not.toHaveBeenCalled();
    });

    it.each(Object.values(TaskStatus))(
      'updates task status to %s',
      async (status) => {
        await service.updateStatus(task.id, { status }, manager.id);

        expect(mockTasks.updateStatusInTransaction).toHaveBeenCalledWith(
          tx,
          task.id,
          status,
        );
      },
    );

    it('assigns an active user', async () => {
      await service.assign(task.id, { assignedToId: 'user-1' }, manager.id);

      expect(mockTasks.assignInTransaction).toHaveBeenCalledWith(
        tx,
        task.id,
        'user-1',
      );
    });

    it('rejects an inactive assignee', async () => {
      mockTasks.findAssigneeInTransaction.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.assign(task.id, { assignedToId: 'user-1' }, manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.INVALID_TASK_ASSIGNEE,
        },
      });
    });

    it('deletes a task without modifying project progress', async () => {
      await expect(service.remove(task.id, manager.id)).resolves.toEqual({
        message: 'Task deleted successfully',
      });

      expect(mockTasks.deleteInTransaction).toHaveBeenCalledWith(tx, task.id);
    });

    it('rechecks task existence inside the transaction', async () => {
      mockTasks.findByIdInTransaction.mockResolvedValue(null);

      await expect(
        service.update(task.id, { taskName: 'Updated' }, manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_NOT_FOUND,
        },
      });

      expect(mockTasks.updateInTransaction).not.toHaveBeenCalled();
    });

    it('rejects deletion of a missing task', async () => {
      mockTasks.findById.mockResolvedValue(null);

      await expect(
        service.remove('missing-task', manager.id),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_NOT_FOUND,
        },
      });
    });
  });

  describe('Transaction retries', () => {
    it('retries Prisma serialization conflicts', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'Serialization conflict',
        {
          code: 'P2034',
          clientVersion: '7.10.0',
        },
      );

      mockTasks.transaction
        .mockRejectedValueOnce(conflict)
        .mockImplementationOnce(
          (work: (client: TaskTransaction) => Promise<unknown>) => work(tx),
        );

      await service.create(createDto, manager.id);

      expect(mockTasks.transaction).toHaveBeenCalledTimes(2);
    });

    it('stops after four serialization failures', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'Serialization conflict',
        {
          code: 'P2034',
          clientVersion: '7.10.0',
        },
      );

      mockTasks.transaction.mockRejectedValue(conflict);

      await expect(service.create(createDto, manager.id)).rejects.toMatchObject(
        {
          response: {
            code: ErrorCode.TASK_CONCURRENCY_CONFLICT,
          },
        },
      );

      expect(mockTasks.transaction).toHaveBeenCalledTimes(4);
    });

    it('does not retry unrelated database errors', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );

      mockTasks.transaction.mockRejectedValue(error);

      await expect(service.create(createDto, manager.id)).rejects.toBe(error);

      expect(mockTasks.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Additional lifecycle and concurrency coverage', () => {
    it.each([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED])(
      'denies every task mutation in %s projects',
      async (status) => {
        mockTasks.findProjectInTransaction.mockResolvedValue({
          ...project,
          status,
        });

        const operations = [
          () => service.update(task.id, { taskName: 'Changed' }, manager.id),
          () =>
            service.updateStatus(
              task.id,
              { status: TaskStatus.COMPLETED },
              manager.id,
            ),
          () => service.assign(task.id, { assignedToId: 'user-1' }, manager.id),
          () => service.remove(task.id, manager.id),
        ];

        for (const operation of operations) {
          await expect(operation()).rejects.toMatchObject({
            response: { code: ErrorCode.TASK_MODIFICATION_NOT_ALLOWED },
          });
        }

        expect(mockTasks.updateInTransaction).not.toHaveBeenCalled();
        expect(mockTasks.updateStatusInTransaction).not.toHaveBeenCalled();
        expect(mockTasks.assignInTransaction).not.toHaveBeenCalled();
        expect(mockTasks.deleteInTransaction).not.toHaveBeenCalled();
      },
    );

    it('denies all mutations by an unassigned Project Manager', async () => {
      mockTasks.findActor.mockResolvedValue({
        ...manager,
        id: 'other-manager',
      });

      const operations = [
        () => service.update(task.id, { taskName: 'Changed' }, 'other-manager'),
        () =>
          service.updateStatus(
            task.id,
            { status: TaskStatus.BLOCKED },
            'other-manager',
          ),
        () =>
          service.assign(task.id, { assignedToId: 'user-1' }, 'other-manager'),
        () => service.remove(task.id, 'other-manager'),
      ];

      for (const operation of operations) {
        await expect(operation()).rejects.toMatchObject({
          response: { code: ErrorCode.PROJECT_ACCESS_DENIED },
        });
      }

      expect(mockTasks.updateInTransaction).not.toHaveBeenCalled();
      expect(mockTasks.updateStatusInTransaction).not.toHaveBeenCalled();
      expect(mockTasks.assignInTransaction).not.toHaveBeenCalled();
      expect(mockTasks.deleteInTransaction).not.toHaveBeenCalled();
    });

    it('rejects a changed project ID during transactional reread', async () => {
      mockTasks.findByIdInTransaction.mockResolvedValue({
        ...task,
        projectId: 'other-project',
      });

      await expect(
        service.updateStatus(
          task.id,
          { status: TaskStatus.COMPLETED },
          manager.id,
        ),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.TASK_NOT_FOUND },
      });

      expect(mockTasks.updateStatusInTransaction).not.toHaveBeenCalled();
    });

    it('retries Neon P2010 serialization failures', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError(
        'Neon serialization failure',
        {
          code: 'P2010',
          clientVersion: '7.10.0',
          meta: { code: '40001' },
        },
      );

      mockTasks.transaction.mockRejectedValueOnce(conflict);

      await service.create(createDto, manager.id);

      expect(mockTasks.transaction).toHaveBeenCalledTimes(2);
      expect(mockTasks.createInTransaction).toHaveBeenCalledTimes(1);
    });

    it('retries unwrapped Neon driver serialization failures', async () => {
      const conflict = Object.assign(new Error('Transaction conflict'), {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '40001',
          kind: 'TransactionWriteConflict',
        },
      });

      mockTasks.transaction.mockRejectedValueOnce(conflict);

      await service.create(createDto, manager.id);

      expect(mockTasks.transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry P2010 for unrelated SQLSTATE errors', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique violation',
        {
          code: 'P2010',
          clientVersion: '7.10.0',
          meta: { code: '23505' },
        },
      );

      mockTasks.transaction.mockRejectedValue(error);

      await expect(service.create(createDto, manager.id)).rejects.toBe(error);
      expect(mockTasks.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
