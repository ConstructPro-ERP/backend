import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const outstandingInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  project: {
    select: {
      id: true,
      projectName: true,
    },
  },
  customer: {
    select: {
      id: true,
      fullName: true,
    },
  },
});

export type OutstandingInvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: typeof outstandingInclude;
}>;

@Injectable()
export class FinanceSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomer(customerId: string) {
    return this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, fullName: true },
    });
  }

  findProject(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, projectName: true },
    });
  }

  aggregateInvoices(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.aggregate({
      where,
      _sum: {
        totalAmount: true,
        paidAmount: true,
        outstandingAmount: true,
      },
    });
  }

  aggregateExpenses(
    projectId: string,
    query: { fromDate?: string; toDate?: string },
  ) {
    return this.prisma.expense.aggregate({
      where: {
        projectId,
        createdAt:
          query.fromDate || query.toDate
            ? {
                gte: query.fromDate ? new Date(query.fromDate) : undefined,
                lte: query.toDate ? endOfRequestedDay(query.toDate) : undefined,
              }
            : undefined,
      },
      _sum: {
        amount: true,
      },
    });
  }

  findOutstandingInvoices(args: {
    where: Prisma.InvoiceWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InvoiceOrderByWithRelationInput;
  }) {
    return this.prisma.invoice.findMany({
      ...args,
      include: outstandingInclude,
    });
  }

  countOutstandingInvoices(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.count({ where });
  }
}

function endOfRequestedDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T23:59:59.999Z`);
}
