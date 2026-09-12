import { Injectable } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
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
  quotation: {
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

  create(data: CreateProjectData) {
    return this.prisma.project.create({
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

  update(id: string, data: UpdateProjectData) {
    return this.prisma.project.update({
      where: { id },
      data,
      include: projectInclude,
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
        quotation: {
          select: {
            id: true,
          },
        },
        _count: {
          select: {
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
}
