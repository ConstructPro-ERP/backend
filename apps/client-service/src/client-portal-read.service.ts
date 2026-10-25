import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStorageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../shared/error-codes';
import { ClientPortalAccessService } from './client-portal-access.service';
import { ClientPortalPageQueryDto } from './dto/client-portal-page-query.dto';

// Expose only client-facing project fields.
const projectSelect = {
  id: true,
  projectName: true,
  location: true,
  startDate: true,
  endDate: true,
  status: true,
  progressPercentage: true,
  createdAt: true,
} as const satisfies Prisma.ProjectSelect;

@Injectable()
export class ClientPortalReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientPortalAccessService,
  ) {}

  async findProjects(
    actorId: string | undefined,
    query: ClientPortalPageQueryDto,
  ) {
    const identity = await this.access.resolveClient(actorId);
    const { page, limit, skip } = this.pagination(query);

    const where = this.access.ownedProjectWhere(identity.customerId);

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: projectSelect,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.project.count({ where }),
    ]);

    return this.paginated(items, total, page, limit);
  }

  async findProject(actorId: string | undefined, projectId: string) {
    const identity = await this.access.resolveClient(actorId);

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ...this.access.ownedProjectWhere(identity.customerId),
      },
      select: projectSelect,
    });

    if (!project) {
      throw new NotFoundException({
        code: ErrorCode.PROJECT_NOT_FOUND,
        message: 'Project not found.',
      });
    }

    return project;
  }

  async findMilestones(actorId: string | undefined, projectId: string) {
    const identity = await this.access.resolveClient(actorId);

    await this.access.assertOwnProject(projectId, identity);

    // Reapply ownership in the data query, not only in the pre-check.
    return this.prisma.milestone.findMany({
      where: {
        projectId,
        project: {
          is: this.access.ownedProjectWhere(identity.customerId),
        },
      },
      select: {
        id: true,
        projectId: true,
        milestoneName: true,
        description: true,
        dueDate: true,
        weight: true,
        progressPercentage: true,
        status: true,
        completedAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findDocuments(
    actorId: string | undefined,
    projectId: string,
    query: ClientPortalPageQueryDto,
  ) {
    const identity = await this.access.resolveClient(actorId);

    await this.access.assertOwnProject(projectId, identity);

    const { page, limit, skip } = this.pagination(query);

    const where: Prisma.DocumentWhereInput = {
      projectId,
      storageStatus: DocumentStorageStatus.ACTIVE,
      deletedAt: null,
      project: {
        is: this.access.ownedProjectWhere(identity.customerId),
      },
    };

    // Never expose Cloudinary identifiers, fileUrl or uploader identity.
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          description: true,
          createdAt: true,
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.document.count({ where }),
    ]);

    return this.paginated(items, total, page, limit);
  }

  async findQuotations(
    actorId: string | undefined,
    query: ClientPortalPageQueryDto,
  ) {
    const identity = await this.access.resolveClient(actorId);
    const { page, limit, skip } = this.pagination(query);

    const where: Prisma.QuotationWhereInput = {
      lead: {
        customer: {
          is: { id: identity.customerId },
        },
      },
    };

    const [quotations, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        select: {
          id: true,
          quotationDate: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.quotation.count({ where }),
    ]);

    // Prisma Decimal values are serialized explicitly as money strings.
    const items = quotations.map((quotation) => ({
      ...quotation,
      totalAmount: quotation.totalAmount.toFixed(2),
    }));

    return this.paginated(items, total, page, limit);
  }

  private pagination(query: ClientPortalPageQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  }

  private paginated<T>(items: T[], total: number, page: number, limit: number) {
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
