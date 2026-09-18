import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const projectInclude = Prisma.validator<Prisma.ProjectInclude>()({
  projectManager: {
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
    },
  },
  quotations: {
    select: {
      id: true,
      leadId: true,
      status: true,
      totalAmount: true,
    },
  },
});

export type ProjectWithDetails = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

export type ProjectTransaction = Prisma.TransactionClient;

type CreateProjectData = {
  projectName: string;
  location?: string;
  startDate: Date;
  endDate?: Date;
  budget?: number;
  projectManagerId: string;
  status?: ProjectStatus;
};

type UpdateProjectData = {
  projectName?: string;
  location?: string | null;
  startDate?: Date;
  endDate?: Date | null;
  budget?: number | null;
  projectManagerId?: string;
  status?: ProjectStatus;
};

@Injectable()
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  lockQuotation(tx: ProjectTransaction, quotationId: string) {
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "quotation"
      WHERE "id" = ${quotationId}
      FOR UPDATE
    `;
  }

  findQuotation(tx: ProjectTransaction, quotationId: string) {
    return tx.quotation.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        leadId: true,
        status: true,
        projectId: true,
      },
    });
  }

  create(data: CreateProjectData) {
    return this.prisma.project.create({
      data,
      include: projectInclude,
    });
  }

  createInTransaction(tx: ProjectTransaction, data: CreateProjectData) {
    return tx.project.create({
      data,
      include: projectInclude,
    });
  }

  async findManyAndCount(args: {
    where: Prisma.ProjectWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ProjectOrderByWithRelationInput;
  }): Promise<[ProjectWithDetails[], number]> {
    return this.prisma.$transaction([
      this.prisma.project.findMany({
        ...args,
        include: projectInclude,
      }),
      this.prisma.project.count({
        where: args.where,
      }),
    ]);
  }

  findById(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
  }

  findProjectInTransaction(tx: ProjectTransaction, projectId: string) {
    return tx.project.findUnique({
      where: { id: projectId },
      include: projectInclude,
    });
  }

  findApprovedQuotation(projectId: string) {
    return this.prisma.quotation.findFirst({
      where: {
        projectId,
        status: {
          in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED],
        },
      },
      select: {
        id: true,
        status: true,
      },
    });
  }

  update(id: string, data: UpdateProjectData) {
    return this.prisma.project.update({
      where: { id },
      data,
      include: projectInclude,
    });
  }

  updateInTransaction(
    tx: ProjectTransaction,
    projectId: string,
    data: UpdateProjectData,
  ) {
    return tx.project.update({
      where: { id: projectId },
      data,
      include: projectInclude,
    });
  }

  linkQuotation(
    tx: ProjectTransaction,
    quotationId: string,
    projectId: string,
  ) {
    return tx.quotation.update({
      where: { id: quotationId },
      data: { projectId },
      select: {
        id: true,
        projectId: true,
        status: true,
      },
    });
  }

  delete(id: string) {
    return this.prisma.project.delete({
      where: { id },
    });
  }

  getDependencyCounts(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            quotations: true,
            milestones: true,
            tasks: true,
            expenses: true,
            invoices: true,
            documents: true,
            reports: true,
            aiKnowledgeChunks: true,
          },
        },
      },
    });
  }

  findProjectManager(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        roleId: true,
      },
    });
  }

  findProjectManagerInTransaction(tx: ProjectTransaction, userId: string) {
    return tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        roleId: true,
      },
    });
  }
}
