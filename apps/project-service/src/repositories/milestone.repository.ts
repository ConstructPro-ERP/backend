import { Injectable } from '@nestjs/common';
import { MilestoneStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ProjectTransaction } from './project.repository';

export interface CreateMilestoneData {
  projectId: string;
  milestoneName: string;
  description?: string | null;
  dueDate?: Date | null;
  weight: number;
  progressPercentage?: number;
  status?: MilestoneStatus;
  completedAt?: Date | null;
}

export type UpdateMilestoneData = Partial<
  Omit<CreateMilestoneData, 'projectId'>
>;

const projectSelect = {
  id: true,
  projectManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
  progressPercentage: true,
} as const;

const progressSelect = {
  id: true,
  weight: true,
  progressPercentage: true,
  status: true,
  completedAt: true,
} as const;

@Injectable()
export class MilestoneRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Milestone writes and project progress updates must share one transaction.
  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  // Lock the parent Project before checking weights or changing milestones.
  lockProject(tx: ProjectTransaction, projectId: string) {
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Project"
      WHERE "id" = ${projectId}
      FOR UPDATE
    `;
  }

  findProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: projectSelect,
    });
  }

  findProjectInTransaction(tx: ProjectTransaction, projectId: string) {
    return tx.project.findUnique({
      where: { id: projectId },
      select: projectSelect,
    });
  }

  findById(id: string) {
    return this.prisma.milestone.findUnique({
      where: { id },
      include: {
        project: {
          select: projectSelect,
        },
      },
    });
  }

  findByProjectId(projectId: string) {
    return this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findByIdInTransaction(tx: ProjectTransaction, id: string) {
    return tx.milestone.findUnique({
      where: { id },
    });
  }

  // Read all milestone values needed to validate total weight,
  // calculate project progress, and check project completion.
  findProgressInputsInTransaction(tx: ProjectTransaction, projectId: string) {
    return tx.milestone.findMany({
      where: { projectId },
      select: progressSelect,
    });
  }

  createInTransaction(tx: ProjectTransaction, data: CreateMilestoneData) {
    return tx.milestone.create({
      data,
    });
  }

  updateInTransaction(
    tx: ProjectTransaction,
    id: string,
    data: UpdateMilestoneData,
  ) {
    return tx.milestone.update({
      where: { id },
      data,
    });
  }

  deleteInTransaction(tx: ProjectTransaction, id: string) {
    return tx.milestone.delete({
      where: { id },
    });
  }

  updateProjectProgressInTransaction(
    tx: ProjectTransaction,
    projectId: string,
    progressPercentage: number,
  ) {
    return tx.project.update({
      where: { id: projectId },
      data: { progressPercentage },
      select: {
        id: true,
        progressPercentage: true,
      },
    });
  }
}
