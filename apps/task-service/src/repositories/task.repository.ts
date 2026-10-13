import { Injectable } from '@nestjs/common';
import { Prisma, type Task, type TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export type TaskTransaction = Prisma.TransactionClient;

export interface CreateTaskData {
  projectId: string;
  milestoneId?: string | null;
  assignedToId?: string | null;
  taskName: string;
  description?: string | null;
  dueDate?: Date | null;
  status?: TaskStatus;
}

export interface UpdateTaskData {
  taskName?: string;
  description?: string | null;
  dueDate?: Date | null;
  milestoneId?: string | null;
}

export interface TaskListArgs {
  where: Prisma.TaskWhereInput;
  skip: number;
  take: number;
  orderBy: Prisma.TaskOrderByWithRelationInput[];
}

const projectSelect = {
  id: true,
  projectManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
} as const;

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: TaskTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  // Keep Task writes consistent with Project lifecycle changes.
  lockProject(tx: TaskTransaction, projectId: string) {
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

  findProjectInTransaction(tx: TaskTransaction, projectId: string) {
    return tx.project.findUnique({
      where: { id: projectId },
      select: projectSelect,
    });
  }

  findMilestoneInTransaction(tx: TaskTransaction, milestoneId: string) {
    return tx.milestone.findUnique({
      where: { id: milestoneId },
      select: { id: true, projectId: true },
    });
  }

  findAssigneeInTransaction(tx: TaskTransaction, userId: string) {
    return tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
  }

  findActor(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: { select: { roleName: true } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: { project: { select: projectSelect } },
    });
  }

  findByIdInTransaction(tx: TaskTransaction, id: string) {
    return tx.task.findUnique({ where: { id } });
  }

  async findManyAndCount(args: TaskListArgs): Promise<[Task[], number]> {
    return this.prisma.$transaction([
      this.prisma.task.findMany({
        where: args.where,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
      }),
      this.prisma.task.count({ where: args.where }),
    ]);
  }

  createInTransaction(tx: TaskTransaction, data: CreateTaskData) {
    return tx.task.create({ data });
  }

  updateInTransaction(tx: TaskTransaction, id: string, data: UpdateTaskData) {
    return tx.task.update({ where: { id }, data });
  }

  updateStatusInTransaction(
    tx: TaskTransaction,
    id: string,
    status: TaskStatus,
  ) {
    return tx.task.update({ where: { id }, data: { status } });
  }

  assignInTransaction(tx: TaskTransaction, id: string, assignedToId: string) {
    return tx.task.update({ where: { id }, data: { assignedToId } });
  }

  deleteInTransaction(tx: TaskTransaction, id: string) {
    return tx.task.delete({ where: { id } });
  }
}
