import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
  QuotationStatus,
  UserStatus,
} from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import { ProjectAccessService } from './project-access.service';
import { AssignProjectManagerDto } from './dto/assign-project-manager.dto';
import { CreateProjectFromQuotationDto } from './dto/create-project-from-quotation.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ProjectQueryDto,
  ProjectSortField,
  SortOrder,
} from './dto/project-query.dto';
import { UpdateProjectStatusDto } from './dto/project-status.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import {
  ProjectRepository,
  ProjectTransaction,
} from './repositories/project.repository';
import { ProjectManagerCandidate } from './interfaces/project-manager.interface';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  getHealth() {
    return {
      service: 'project-service',
      status: 'ok',
    };
  }

  async create(dto: CreateProjectDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);

    this.projectAccess.assertCanCreateProject(actor);

    await this.ensureValidProjectManager(dto.projectManagerId);

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    this.validateDateRange(startDate, endDate);

    return this.projects.create({
      projectName: dto.projectName,
      location: dto.location,
      startDate,
      endDate,
      budget: dto.budget,
      projectManagerId: dto.projectManagerId,
      status: ProjectStatus.PLANNING,
    });
  }

  // Internal Quotation Service flow.
  async createFromQuotation(dto: CreateProjectFromQuotationDto) {
    return this.withTransactionRetry((tx) =>
      this.convertFromQuotation(tx, dto),
    );
  }

  async findAll(query: ProjectQueryDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);

    const where: Prisma.ProjectWhereInput = {};

    // Project Managers always see only their assigned projects.
    if (actor.role === 'PROJECT_MANAGER') {
      where.projectManagerId = actor.id;
    } else if (query.projectManagerId) {
      // Admins and Accountants may filter by Project Manager.
      where.projectManagerId = query.projectManagerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        {
          projectName: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? ProjectSortField.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const [projects, total] = await this.projects.findManyAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    return {
      data: projects,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const project = await this.getProjectOrThrow(id);

    this.projectAccess.assertCanReadProject(actor, project);

    return project;
  }

  async update(id: string, dto: UpdateProjectDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const existingProject = await this.getProjectOrThrow(id);

    this.projectAccess.assertCanModifyProject(actor, existingProject);

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existingProject.startDate;

    const endDate =
      dto.endDate === undefined
        ? existingProject.endDate
        : dto.endDate === null
          ? null
          : new Date(dto.endDate);

    this.validateDateRange(startDate, endDate);

    return this.projects.update(id, {
      projectName: dto.projectName,
      location: dto.location,
      startDate: dto.startDate ? startDate : undefined,
      endDate: dto.endDate === undefined ? undefined : endDate,
      budget: dto.budget,
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateProjectStatusDto,
    actorId?: string,
  ) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const project = await this.getProjectOrThrow(id);

    this.projectAccess.assertCanModifyProject(actor, project);

    const approvedQuotation = await this.projects.findApprovedQuotation(id);

    if (dto.status === ProjectStatus.ACTIVE && !approvedQuotation) {
      throw new BadRequestException(
        'Project cannot become ACTIVE until at least one quotation is approved',
      );
    }

    if (dto.status === ProjectStatus.PLANNING && approvedQuotation) {
      throw new BadRequestException(
        'Project cannot return to PLANNING after an approved quotation is associated',
      );
    }

    return this.projects.update(id, {
      status: dto.status,
    });
  }

  async assignManager(
    id: string,
    dto: AssignProjectManagerDto,
    actorId?: string,
  ) {
    const actor = await this.projectAccess.resolveActor(actorId);

    this.projectAccess.assertCanAssignProjectManager(actor);

    await this.getProjectOrThrow(id);
    await this.ensureValidProjectManager(dto.projectManagerId);

    return this.projects.update(id, {
      projectManagerId: dto.projectManagerId,
    });
  }

  async remove(id: string) {
    const project = await this.projects.getDependencyCounts(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const hasDependencies = Object.values(project._count).some(
      (count) => count > 0,
    );

    if (hasDependencies) {
      // Preserve project history when other domain records already depend on it.
      throw new ConflictException(
        `Project cannot be deleted because related records exist. Set its status to ${ProjectStatus.CANCELLED} instead.`,
      );
    }

    await this.projects.delete(id);

    return {
      message: 'Project deleted successfully',
    };
  }

  private async getProjectOrThrow(id: string) {
    const project = await this.projects.findById(id);

    if (!project) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      });
    }

    return project;
  }

  private async convertFromQuotation(
    tx: ProjectTransaction,
    dto: CreateProjectFromQuotationDto,
  ) {
    await this.projects.lockQuotation(tx, dto.quotationId);

    const quotation = await this.projects.findQuotation(tx, dto.quotationId);

    if (!quotation) {
      throw new NotFoundException({
        code: 'QUOTATION_NOT_FOUND',
        message: 'Quotation not found.',
      });
    }

    if (quotation.leadId !== dto.leadId) {
      throw new BadRequestException({
        code: 'QUOTATION_LEAD_MISMATCH',
        message: 'The supplied lead does not match the quotation.',
      });
    }

    if (
      quotation.status !== QuotationStatus.APPROVED &&
      quotation.status !== QuotationStatus.CONVERTED
    ) {
      throw new BadRequestException({
        code: 'QUOTATION_NOT_APPROVED',
        message:
          'Quotation must be approved before it can be associated with a project.',
      });
    }

    if (
      quotation.projectId &&
      dto.targetProjectId &&
      quotation.projectId !== dto.targetProjectId
    ) {
      throw new ConflictException({
        code: 'QUOTATION_PROJECT_MISMATCH',
        message: 'Quotation is already associated with a different project.',
      });
    }

    if (quotation.projectId) {
      const existingProject = await this.projects.findProjectInTransaction(
        tx,
        quotation.projectId,
      );

      if (!existingProject) {
        throw new NotFoundException({
          code: 'PROJECT_NOT_FOUND',
          message: 'Associated project not found.',
        });
      }

      const project =
        existingProject.status === ProjectStatus.PLANNING
          ? await this.projects.updateInTransaction(tx, existingProject.id, {
              status: ProjectStatus.ACTIVE,
            })
          : existingProject;

      return {
        projectId: project.id,
        status: project.status,
      };
    }

    if (dto.targetProjectId) {
      const targetProject = await this.projects.findProjectInTransaction(
        tx,
        dto.targetProjectId,
      );

      if (!targetProject) {
        throw new NotFoundException({
          code: 'PROJECT_NOT_FOUND',
          message: 'Target project not found.',
        });
      }

      await this.projects.linkQuotation(tx, quotation.id, targetProject.id);

      const project =
        targetProject.status === ProjectStatus.PLANNING
          ? await this.projects.updateInTransaction(tx, targetProject.id, {
              status: ProjectStatus.ACTIVE,
            })
          : targetProject;

      return {
        projectId: project.id,
        status: project.status,
      };
    }

    if (!dto.projectName || !dto.startDate || !dto.projectManagerId) {
      throw new BadRequestException({
        code: 'PROJECT_DETAILS_REQUIRED',
        message:
          'projectName, startDate, and projectManagerId are required when creating a new project.',
      });
    }

    await this.ensureValidProjectManagerInTransaction(tx, dto.projectManagerId);

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    this.validateDateRange(startDate, endDate);

    const project = await this.projects.createInTransaction(tx, {
      projectName: dto.projectName,
      location: dto.location,
      startDate,
      endDate,
      budget: dto.budget,
      projectManagerId: dto.projectManagerId,
      status: ProjectStatus.ACTIVE,
    });

    await this.projects.linkQuotation(tx, quotation.id, project.id);

    return {
      projectId: project.id,
      status: project.status,
    };
  }

  private async ensureValidProjectManager(userId: string) {
    const manager = await this.projects.findProjectManagerCandidate(userId);

    this.validateProjectManager(manager);
  }

  private async ensureValidProjectManagerInTransaction(
    tx: ProjectTransaction,
    userId: string,
  ) {
    const manager =
      await this.projects.findProjectManagerCandidateInTransaction(tx, userId);

    this.validateProjectManager(manager);
  }

  private validateProjectManager(
    manager: ProjectManagerCandidate | null,
  ): void {
    if (!manager) {
      throw new BadRequestException({
        code: ErrorCode.PROJECT_MANAGER_NOT_FOUND,
        message: 'Project manager not found.',
      });
    }

    if (manager.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: ErrorCode.PROJECT_MANAGER_INACTIVE,
        message: 'Project manager must be an active user.',
      });
    }

    if (manager.role?.roleName !== 'PROJECT_MANAGER') {
      throw new BadRequestException({
        code: ErrorCode.INVALID_PROJECT_MANAGER_ROLE,
        message: 'Selected user must have the PROJECT_MANAGER role.',
      });
    }
  }

  private validateDateRange(startDate: Date, endDate?: Date | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'Project end date cannot be before the start date',
      );
    }
  }

  private async withTransactionRetry<T>(
    work: (tx: ProjectTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.projects.transaction(work);
      } catch (error: unknown) {
        if (isRetryableTransactionError(error)) {
          if (attempt < 3) {
            continue;
          }

          throw new ConflictException({
            code: 'PROJECT_CONVERSION_CONCURRENCY_CONFLICT',
            message:
              'The quotation changed while creating the project. Try again.',
          });
        }

        throw error;
      }
    }

    throw new ConflictException({
      code: 'PROJECT_CONVERSION_CONCURRENCY_CONFLICT',
      message: 'The quotation changed while creating the project. Try again.',
    });
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  // Standard Prisma transaction write-conflict error.
  if (error.code === 'P2034') {
    return true;
  }

  // Raw PostgreSQL errors executed through the Neon driver adapter can be
  // surfaced by Prisma as P2010 instead of P2034.
  if (error.code !== 'P2010') {
    return false;
  }

  return containsSerializationConflict(error.meta);
}

function containsSerializationConflict(meta: unknown): boolean {
  if (!isRecord(meta)) {
    return false;
  }

  // Some Prisma/database adapter paths expose the PostgreSQL SQLSTATE
  // directly in meta.
  if (meta.code === '40001') {
    return true;
  }

  const driverAdapterError = meta.driverAdapterError;

  if (!isRecord(driverAdapterError)) {
    return false;
  }

  const cause = driverAdapterError.cause;

  if (!isRecord(cause)) {
    return false;
  }

  return (
    cause.originalCode === '40001' ||
    cause.code === '40001' ||
    cause.kind === 'TransactionWriteConflict'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
