import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectStatus, UserStatus } from '@prisma/client';
import { AssignProjectManagerDto } from './dto/assign-project-manager.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ProjectQueryDto,
  ProjectSortField,
  SortOrder,
} from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateProjectStatusDto } from './dto/project-status.dto';
import { ProjectRepository } from './repositories/project.repository';

@Injectable()
export class ProjectService {
  constructor(private readonly projects: ProjectRepository) {}

  getHealth() {
    return {
      service: 'project-service',
      status: 'ok',
    };
  }

  async create(dto: CreateProjectDto) {
    await this.ensureActiveManager(dto.projectManagerId);

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
      status: dto.status,
    });
  }

  async findAll(query: ProjectQueryDto) {
    const where: Prisma.ProjectWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.projectManagerId) {
      where.projectManagerId = query.projectManagerId;
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

  async findOne(id: string) {
    const project = await this.projects.findById(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existingProject = await this.findOne(id);

    if (dto.projectManagerId) {
      await this.ensureActiveManager(dto.projectManagerId);
    }

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
      projectManagerId: dto.projectManagerId,
      status: dto.status,
    });
  }

  async updateStatus(id: string, dto: UpdateProjectStatusDto) {
    await this.findOne(id);

    return this.projects.update(id, {
      status: dto.status,
    });
  }

  async assignManager(id: string, dto: AssignProjectManagerDto) {
    await this.findOne(id);
    await this.ensureActiveManager(dto.projectManagerId);

    return this.projects.update(id, {
      projectManagerId: dto.projectManagerId,
    });
  }

  async remove(id: string) {
    const project = await this.projects.getDependencyCounts(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const hasDependencies =
      project.quotation !== null ||
      Object.values(project._count).some((count) => count > 0);

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

  private async ensureActiveManager(userId: string) {
    const manager = await this.projects.findProjectManager(userId);

    if (!manager) {
      throw new BadRequestException('Project manager not found');
    }

    if (manager.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Project manager must be an active user');
    }
  }

  private validateDateRange(startDate: Date, endDate?: Date | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException(
        'Project end date cannot be before the start date',
      );
    }
  }
}
