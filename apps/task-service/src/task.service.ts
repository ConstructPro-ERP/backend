import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, TaskStatus, UserStatus } from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import {
  MAX_TRANSACTION_ATTEMPTS,
  TRANSACTION_RETRY_DELAY_OPTIONS,
  isRetryableTransactionError,
  waitBeforeTransactionRetry,
} from '../../../shared/utils/transaction-error.util';
import type { TransactionRetryDelayOptions } from '../../../shared/utils/transaction-error.util';
import { CreateTaskDto } from './dto/create-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import {
  TaskQueryDto,
  TaskSortField,
  TaskSortOrder,
} from './dto/task-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskRepository } from './repositories/task.repository';
import type { TaskTransaction } from './repositories/task.repository';

type TaskActor = {
  id: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'ACCOUNTANT';
};

type TaskProject = {
  id: string;
  projectManagerId: string;
  startDate: Date;
  endDate: Date | null;
  status: ProjectStatus;
};

@Injectable()
export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    @Optional()
    @Inject(TRANSACTION_RETRY_DELAY_OPTIONS)
    private readonly retryDelayOptions?: TransactionRetryDelayOptions,
  ) {}

  getHealth() {
    return {
      service: 'task-service',
      status: 'ok',
    };
  }

  // Create a project-level or milestone-linked task.
  async create(dto: CreateTaskDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    return this.withLockedProject(dto.projectId, actor, async (tx, project) => {
      await this.assertValidMilestone(tx, dto.milestoneId, project.id);

      await this.assertValidAssignee(tx, dto.assignedToId);

      this.assertDueDateWithinProject(dto.dueDate, project);

      return this.tasks.createInTransaction(tx, {
        projectId: project.id,
        milestoneId: dto.milestoneId,
        assignedToId: dto.assignedToId,
        taskName: dto.taskName,
        description: dto.description,
        dueDate: this.toDate(dto.dueDate),
        status: dto.status ?? TaskStatus.TODO,
      });
    });
  }

  async findAll(query: TaskQueryDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    const where: Prisma.TaskWhereInput = {};

    // Explicit project filters must respect project access.
    if (query.projectId) {
      const project = await this.getProjectOrThrow(query.projectId);

      this.assertCanReadProject(actor, project);
      where.projectId = query.projectId;
    }

    // Apply Project Manager ownership before querying the database.
    if (actor.role === 'PROJECT_MANAGER') {
      where.project = {
        projectManagerId: actor.id,
      };
    }

    if (query.milestoneId) {
      where.milestoneId = query.milestoneId;
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? TaskSortField.CREATED_AT;
    const sortOrder = query.sortOrder ?? TaskSortOrder.DESC;

    const [tasks, total] = await this.tasks.findManyAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
    });

    return {
      data: tasks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByProject(
    projectId: string,
    query: TaskQueryDto,
    actorId?: string,
  ) {
    // The path parameter is authoritative for project-scoped queries.
    if (query.projectId && query.projectId !== projectId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Query projectId must match the project in the URL.',
      });
    }

    return this.findAll({ ...query, projectId }, actorId);
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);
    const task = await this.getTaskOrThrow(id);

    this.assertCanReadProject(actor, task.project);

    return task;
  }

  async update(id: string, dto: UpdateTaskDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    return this.withLockedTask(id, actor, async (tx, current, project) => {
      // Validate only the relationships being changed.
      if (dto.milestoneId !== undefined) {
        await this.assertValidMilestone(tx, dto.milestoneId, project.id);
      }

      if (dto.dueDate !== undefined) {
        this.assertDueDateWithinProject(dto.dueDate, project);
      }

      return this.tasks.updateInTransaction(tx, current.id, {
        taskName: dto.taskName,
        description: dto.description,
        milestoneId: dto.milestoneId,
        dueDate: this.toDate(dto.dueDate),
      });
    });
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    return this.withLockedTask(id, actor, (tx, current) =>
      this.tasks.updateStatusInTransaction(tx, current.id, dto.status),
    );
  }

  async assign(id: string, dto: AssignTaskDto, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    return this.withLockedTask(id, actor, async (tx, current) => {
      await this.assertValidAssignee(tx, dto.assignedToId);

      return this.tasks.assignInTransaction(tx, current.id, dto.assignedToId);
    });
  }

  async remove(id: string, actorId?: string) {
    const actor = await this.resolveActor(actorId);

    return this.withLockedTask(id, actor, async (tx, current) => {
      await this.tasks.deleteInTransaction(tx, current.id);

      return {
        message: 'Task deleted successfully',
      };
    });
  }

  // Resolve the authenticated user and their project role.
  private async resolveActor(actorId?: string): Promise<TaskActor> {
    if (!actorId) {
      throw new UnauthorizedException({
        code: ErrorCode.PROJECT_ACTOR_REQUIRED,
        message: 'Authenticated user information is required.',
      });
    }

    const user = await this.tasks.findActor(actorId);

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.PROJECT_ACTOR_NOT_FOUND,
        message: 'Authenticated user could not be resolved.',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.PROJECT_ACTOR_INACTIVE,
        message: 'Inactive users cannot access project operations.',
      });
    }

    const role = user.role?.roleName;

    switch (role) {
      case 'ADMIN':
      case 'PROJECT_MANAGER':
      case 'ACCOUNTANT':
        return { id: user.id, role };

      default:
        throw new ForbiddenException({
          code: ErrorCode.PROJECT_ACCESS_DENIED,
          message: 'You do not have permission to access project operations.',
        });
    }
  }

  // Only Admins and the assigned Project Manager may modify tasks.
  private assertCanModifyProject(actor: TaskActor, project: TaskProject): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (
      actor.role === 'PROJECT_MANAGER' &&
      project.projectManagerId === actor.id
    ) {
      return;
    }

    throw new ForbiddenException({
      code: ErrorCode.PROJECT_ACCESS_DENIED,
      message: 'You do not have permission to access this project.',
      details: { projectId: project.id },
    });
  }

  private assertCanReadProject(actor: TaskActor, project: TaskProject): void {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT') {
      return;
    }

    if (
      actor.role === 'PROJECT_MANAGER' &&
      project.projectManagerId === actor.id
    ) {
      return;
    }

    throw new ForbiddenException({
      code: ErrorCode.PROJECT_ACCESS_DENIED,
      message: 'You do not have permission to access this project.',
      details: { projectId: project.id },
    });
  }

  // Preserve the Project Service lifecycle restrictions.
  private assertProjectMutable(project: TaskProject): void {
    if (
      project.status === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.CANCELLED
    ) {
      throw new ConflictException({
        code: ErrorCode.TASK_MODIFICATION_NOT_ALLOWED,
        message: 'Tasks cannot be modified in completed or cancelled projects.',
      });
    }
  }

  // An optional milestone must belong to the task's project.
  private async assertValidMilestone(
    tx: TaskTransaction,
    milestoneId: string | null | undefined,
    projectId: string,
  ): Promise<void> {
    if (milestoneId == null) {
      return;
    }

    const milestone = await this.tasks.findMilestoneInTransaction(
      tx,
      milestoneId,
    );

    if (!milestone) {
      throw new NotFoundException({
        code: ErrorCode.TASK_MILESTONE_NOT_FOUND,
        message: 'Milestone not found.',
      });
    }

    if (milestone.projectId !== projectId) {
      throw new BadRequestException({
        code: ErrorCode.TASK_MILESTONE_PROJECT_MISMATCH,
        message: 'Milestone does not belong to the specified project.',
      });
    }
  }

  // An optional assignee must be an existing, active user.
  private async assertValidAssignee(
    tx: TaskTransaction,
    assignedToId: string | null | undefined,
  ): Promise<void> {
    if (assignedToId == null) {
      return;
    }

    const user = await this.tasks.findAssigneeInTransaction(tx, assignedToId);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_TASK_ASSIGNEE,
        message: 'Task assignee must be an existing active user.',
      });
    }
  }

  // Task due dates must fit within the parent Project dates.
  private assertDueDateWithinProject(
    value: string | null | undefined,
    project: TaskProject,
  ): void {
    if (value == null) {
      return;
    }

    const dueDate = new Date(value);

    if (
      !Number.isFinite(dueDate.getTime()) ||
      dueDate < project.startDate ||
      (project.endDate !== null && dueDate > project.endDate)
    ) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_TASK_DUE_DATE,
        message: 'Task due date must be within the project date range.',
      });
    }
  }

  private toDate(value: string | null | undefined): Date | null | undefined {
    return value === undefined
      ? undefined
      : value === null
        ? null
        : new Date(value);
  }

  private async getProjectOrThrow(id: string) {
    const project = await this.tasks.findProject(id);

    if (!project) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      });
    }

    return project;
  }

  private async getTaskOrThrow(id: string) {
    const task = await this.tasks.findById(id);

    if (!task) {
      this.throwTaskNotFound();
    }

    return task;
  }

  private throwTaskNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.TASK_NOT_FOUND,
      message: 'Task not found.',
    });
  }

  // Perform validation and writes while holding the project lock.
  private async withLockedProject<T>(
    projectId: string,
    actor: TaskActor,
    work: (tx: TaskTransaction, project: TaskProject) => Promise<T>,
  ): Promise<T> {
    return this.withTransactionRetry(async (tx) => {
      const locked = await this.tasks.lockProject(tx, projectId);

      if (locked.length === 0) {
        throw new NotFoundException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not found.',
        });
      }

      const project = await this.tasks.findProjectInTransaction(tx, projectId);

      if (!project) {
        throw new NotFoundException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not found.',
        });
      }

      this.assertCanModifyProject(actor, project);
      this.assertProjectMutable(project);

      return work(tx, project);
    });
  }

  private async withLockedTask<T>(
    id: string,
    actor: TaskActor,
    work: (
      tx: TaskTransaction,
      task: { id: string; projectId: string },
      project: TaskProject,
    ) => Promise<T>,
  ): Promise<T> {
    // First read determines which parent Project must be locked.
    const existing = await this.getTaskOrThrow(id);

    return this.withLockedProject(
      existing.projectId,
      actor,
      async (tx, project) => {
        // Recheck inside the transaction after acquiring the lock.
        const current = await this.tasks.findByIdInTransaction(tx, id);

        if (!current || current.projectId !== project.id) {
          this.throwTaskNotFound();
        }

        return work(tx, current, project);
      },
    );
  }

  // Reuse the established Prisma / Neon serialization retry policy.
  private async withTransactionRetry<T>(
    work: (tx: TaskTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.tasks.transaction(work);
      } catch (error: unknown) {
        if (!isRetryableTransactionError(error)) {
          throw error;
        }

        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({
            code: ErrorCode.TASK_CONCURRENCY_CONFLICT,
            message: 'Task data changed concurrently. Try again.',
          });
        }

        await waitBeforeTransactionRetry(attempt, this.retryDelayOptions);
      }
    }

    throw new ConflictException({
      code: ErrorCode.TASK_CONCURRENCY_CONFLICT,
      message: 'Task data changed concurrently. Try again.',
    });
  }
}
