import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { MilestoneStatus, Prisma, ProjectStatus } from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { UpdateMilestoneProgressDto } from './dto/update-milestone-progress.dto';
import { ProjectAccessService } from './project-access.service';
import type { ProjectAccessActor } from './interfaces/project-access.interface';
import { MilestoneRepository } from './repositories/milestone.repository';
import type { ProjectTransaction } from './repositories/project.repository';
import {
  MAX_TRANSACTION_ATTEMPTS,
  TRANSACTION_RETRY_DELAY_OPTIONS,
  isRetryableTransactionError,
  waitBeforeTransactionRetry,
} from '../../../shared/utils/transaction-error.util';
import type { TransactionRetryDelayOptions } from '../../../shared/utils/transaction-error.util';

@Injectable()
export class MilestoneService {
  constructor(
    private readonly milestones: MilestoneRepository,
    private readonly projectAccess: ProjectAccessService,
    @Optional()
    @Inject(TRANSACTION_RETRY_DELAY_OPTIONS)
    private readonly retryDelayOptions?: TransactionRetryDelayOptions,
  ) {}

  async create(projectId: string, dto: CreateMilestoneDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);

    this.assertValidWeight(dto.weight);

    const progress = dto.progressPercentage ?? 0;
    const state = this.resolveState(progress, dto.status);

    const result = await this.withLockedProject(
      projectId,
      actor,
      async (tx) => {
        const milestone = await this.milestones.createInTransaction(tx, {
          projectId,
          milestoneName: dto.milestoneName,
          description: dto.description,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          weight: dto.weight,
          ...state,
        });

        await this.recalculateProjectProgress(tx, projectId);
        return milestone;
      },
    );

    return this.withDerivedFields(result);
  }

  async findAll(projectId: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const project = await this.milestones.findProject(projectId);

    if (!project) {
      this.throwProjectNotFound();
    }

    this.projectAccess.assertCanReadProject(actor, project);

    const milestones = await this.milestones.findByProjectId(projectId);

    return milestones.map((milestone) => this.withDerivedFields(milestone));
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const milestone = await this.getMilestoneOrThrow(id);

    this.projectAccess.assertCanReadProject(actor, milestone.project);

    return this.withDerivedFields(milestone);
  }

  async update(id: string, dto: UpdateMilestoneDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);

    if (dto.weight !== undefined) {
      this.assertValidWeight(dto.weight);
    }

    const existing = await this.getMilestoneOrThrow(id);

    const result = await this.withLockedProject(
      existing.projectId,
      actor,
      async (tx) => {
        await this.assertMilestoneInTransaction(tx, id, existing.projectId);

        const milestone = await this.milestones.updateInTransaction(tx, id, {
          milestoneName: dto.milestoneName,
          description: dto.description,
          dueDate:
            dto.dueDate === undefined
              ? undefined
              : dto.dueDate === null
                ? null
                : new Date(dto.dueDate),
          weight: dto.weight,
        });

        await this.recalculateProjectProgress(tx, existing.projectId);
        return milestone;
      },
    );

    return this.withDerivedFields(result);
  }

  async updateProgress(
    id: string,
    dto: UpdateMilestoneProgressDto,
    actorId?: string,
  ) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const existing = await this.getMilestoneOrThrow(id);

    const result = await this.withLockedProject(
      existing.projectId,
      actor,
      async (tx) => {
        const current = await this.assertMilestoneInTransaction(
          tx,
          id,
          existing.projectId,
        );

        const state = this.resolveState(
          dto.progressPercentage,
          dto.status,
          current,
        );

        const milestone = await this.milestones.updateInTransaction(
          tx,
          id,
          state,
        );

        await this.recalculateProjectProgress(tx, existing.projectId);
        return milestone;
      },
    );

    return this.withDerivedFields(result);
  }

  async remove(id: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const existing = await this.getMilestoneOrThrow(id);

    return this.withLockedProject(existing.projectId, actor, async (tx) => {
      await this.assertMilestoneInTransaction(tx, id, existing.projectId);

      // Prevent deleting milestones that have attached tasks.
      const taskCount =
        await this.milestones.countTasksForMilestoneInTransaction(tx, id);

      if (taskCount > 0) {
        throw new ConflictException({
          code: ErrorCode.MILESTONE_IN_USE,
          message: 'Milestone cannot be deleted while tasks reference it.',
        });
      }

      try {
        await this.milestones.deleteInTransaction(tx, id);
      } catch (error: unknown) {
        // Keep the database constraint as a final safeguard.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new ConflictException({
            code: ErrorCode.MILESTONE_IN_USE,
            message: 'Milestone cannot be deleted while tasks reference it.',
          });
        }

        throw error;
      }

      await this.recalculateProjectProgress(tx, existing.projectId);

      return { message: 'Milestone deleted successfully' };
    });
  }

  private async withLockedProject<T>(
    projectId: string,
    actor: ProjectAccessActor,
    work: (tx: ProjectTransaction) => Promise<T>,
  ): Promise<T> {
    return this.withTransactionRetry(async (tx) => {
      const locked = await this.milestones.lockProject(tx, projectId);

      if (locked.length === 0) {
        this.throwProjectNotFound();
      }

      const project = await this.milestones.findProjectInTransaction(
        tx,
        projectId,
      );

      if (!project) {
        this.throwProjectNotFound();
      }

      this.projectAccess.assertCanModifyProject(actor, project);

      if (
        project.status === ProjectStatus.COMPLETED ||
        project.status === ProjectStatus.CANCELLED
      ) {
        throw new ConflictException({
          code: ErrorCode.MILESTONE_MODIFICATION_NOT_ALLOWED,
          message:
            'Milestones cannot be modified in completed or cancelled projects.',
        });
      }

      return work(tx);
    });
  }

  private async getMilestoneOrThrow(id: string) {
    const milestone = await this.milestones.findById(id);

    if (!milestone) {
      this.throwMilestoneNotFound();
    }

    return milestone;
  }

  private async assertMilestoneInTransaction(
    tx: ProjectTransaction,
    id: string,
    projectId: string,
  ) {
    const milestone = await this.milestones.findByIdInTransaction(tx, id);

    if (!milestone || milestone.projectId !== projectId) {
      this.throwMilestoneNotFound();
    }

    return milestone;
  }

  private assertValidWeight(weight: number): void {
    if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
      throw new BadRequestException({
        code: ErrorCode.MILESTONE_INVALID_WEIGHT,
        message: 'Milestone weight must be an integer from 1 to 10.',
      });
    }
  }

  private async recalculateProjectProgress(
    tx: ProjectTransaction,
    projectId: string,
  ): Promise<void> {
    const milestones = await this.milestones.findProgressInputsInTransaction(
      tx,
      projectId,
    );

    const totalWeight = milestones.reduce(
      (sum, milestone) => sum + milestone.weight,
      0,
    );

    const weightedProgress = milestones.reduce(
      (sum, milestone) => sum + milestone.progressPercentage * milestone.weight,
      0,
    );

    const progressPercentage =
      totalWeight === 0
        ? 0
        : Math.max(0, Math.min(100, weightedProgress / totalWeight));

    await this.milestones.updateProjectProgressInTransaction(
      tx,
      projectId,
      progressPercentage,
    );
  }

  private resolveState(
    progressPercentage: number,
    requestedStatus?: MilestoneStatus,
    previous?: {
      status: MilestoneStatus;
      completedAt: Date | null;
    },
  ) {
    const status =
      requestedStatus ??
      (progressPercentage === 100
        ? MilestoneStatus.COMPLETED
        : progressPercentage === 0
          ? MilestoneStatus.PENDING
          : MilestoneStatus.IN_PROGRESS);

    if (
      (status === MilestoneStatus.PENDING && progressPercentage !== 0) ||
      (status === MilestoneStatus.IN_PROGRESS && progressPercentage === 100)
    ) {
      throw new BadRequestException({
        code: ErrorCode.MILESTONE_INVALID_STATUS_PROGRESS,
        message: 'Milestone status and progress are inconsistent.',
      });
    }

    if (status === MilestoneStatus.COMPLETED) {
      return {
        progressPercentage: 100,
        status,
        completedAt:
          previous?.status === MilestoneStatus.COMPLETED
            ? (previous.completedAt ?? new Date())
            : new Date(),
      };
    }

    return {
      progressPercentage,
      status,
      completedAt: null,
    };
  }

  private withDerivedFields<
    T extends { dueDate: Date | null; status: MilestoneStatus },
  >(milestone: T) {
    return {
      ...milestone,
      isDelayed:
        milestone.dueDate !== null &&
        milestone.dueDate.getTime() < Date.now() &&
        milestone.status !== MilestoneStatus.COMPLETED,
    };
  }

  private throwProjectNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.PROJECT_NOT_FOUND,
      message: 'Project not found.',
    });
  }

  private throwMilestoneNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.MILESTONE_NOT_FOUND,
      message: 'Milestone not found.',
    });
  }

  private async withTransactionRetry<T>(
    work: (tx: ProjectTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.milestones.transaction(work);
      } catch (error: unknown) {
        if (!isRetryableTransactionError(error)) {
          throw error;
        }

        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({
            code: ErrorCode.MILESTONE_CONCURRENCY_CONFLICT,
            message: 'Milestone data changed concurrently. Try again.',
          });
        }

        await waitBeforeTransactionRetry(attempt, this.retryDelayOptions);
      }
    }

    throw new ConflictException({
      code: ErrorCode.MILESTONE_CONCURRENCY_CONFLICT,
      message: 'Milestone data changed concurrently. Try again.',
    });
  }
}
