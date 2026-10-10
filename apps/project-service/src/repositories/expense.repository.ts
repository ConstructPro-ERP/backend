import { Injectable } from '@nestjs/common';
import { Prisma, type Expense } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ProjectTransaction } from './project.repository';

export interface CreateExpenseData {
  projectId: string;
  recordedById: string;
  amount: Prisma.Decimal;
  category?: string | null;
  description?: string | null;
  expenseDate: Date;
}

export interface UpdateExpenseData {
  amount?: Prisma.Decimal;
  category?: string | null;
  description?: string | null;
  expenseDate?: Date;
}

export interface ExpenseListArgs {
  projectId: string;
  category?: string;
  fromDate?: Date;
  toDate?: Date;
  skip: number;
  take: number;
  orderBy: Prisma.ExpenseOrderByWithRelationInput[];
}

const projectSelect = {
  id: true,
  projectManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
} as const;

@Injectable()
export class ExpenseRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  // Serialize expense writes with project lifecycle changes.
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
    return this.prisma.expense.findUnique({
      where: { id },
      include: {
        project: {
          select: projectSelect,
        },
      },
    });
  }

  findByIdInTransaction(tx: ProjectTransaction, id: string) {
    return tx.expense.findUnique({
      where: { id },
    });
  }

  async findManyAndCount(args: ExpenseListArgs): Promise<[Expense[], number]> {
    const where: Prisma.ExpenseWhereInput = {
      projectId: args.projectId,
      category: args.category,
      expenseDate:
        args.fromDate || args.toDate
          ? {
              gte: args.fromDate,
              lte: args.toDate,
            }
          : undefined,
    };

    return this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
      }),
      this.prisma.expense.count({ where }),
    ]);
  }

  groupByCategory(projectId: string) {
    return this.prisma.expense.groupBy({
      by: ['category'],
      where: { projectId },
      _sum: { amount: true },
      orderBy: { category: 'asc' },
    });
  }

  createInTransaction(tx: ProjectTransaction, data: CreateExpenseData) {
    return tx.expense.create({
      data,
    });
  }

  updateInTransaction(
    tx: ProjectTransaction,
    id: string,
    projectId: string,
    data: UpdateExpenseData,
  ) {
    return tx.expense.update({
      where: { id, projectId },
      data,
    });
  }

  deleteInTransaction(tx: ProjectTransaction, id: string, projectId: string) {
    return tx.expense.delete({
      where: { id, projectId },
    });
  }
}
