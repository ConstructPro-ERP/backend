import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProjectForRiskForecast(projectId: string) {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: {
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            milestoneName: true,
            dueDate: true,
            status: true,
            createdAt: true,
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            dueDate: true,
            status: true,
            totalAmount: true,
            outstandingAmount: true,
            createdAt: true,
          },
        },
        expenses: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async findVectorKnowledgeChunks(projectId: string, limit: number) {
    const table = process.env.RAG_VECTOR_TABLE;
    if (!table) return [];

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          projectId: string | null;
          sourceType: string;
          sourceId: string | null;
          content: string;
          similarityScore: number | null;
        }>
      >(
        `SELECT id, "projectId", "sourceType", "sourceId", content, NULL::double precision AS "similarityScore"
         FROM "${table}"
         WHERE "projectId" = $1
         ORDER BY "createdAt" DESC
         LIMIT $2`,
        projectId,
        limit,
      );
      return rows;
    } catch {
      return [];
    }
  }

  findPaymentsForRiskForecast(projectId: string) {
    return this.prisma.payment.findMany({
      where: {
        invoice: {
          projectId,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        referenceNumber: true,
      },
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

  countProjects(where: Prisma.ProjectWhereInput) {
    return this.prisma.project.count({ where });
  }

  groupInvoiceStatuses(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  countLeads(where: Prisma.LeadWhereInput) {
    return this.prisma.lead.count({ where });
  }

  countConvertedLeads(where: Prisma.LeadWhereInput) {
    return this.prisma.lead.count({
      where: {
        ...where,
        status: LeadStatus.CONVERTED,
      },
    });
  }

  groupQuotationStatuses(where: Prisma.QuotationWhereInput) {
    return this.prisma.quotation.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  findRecentInvoices(where: Prisma.InvoiceWhereInput, take: number) {
    return this.prisma.invoice.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findRecentPayments(where: Prisma.PaymentWhereInput, take: number) {
    return this.prisma.payment.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: {
          select: {
            id: true,
            project: { select: { id: true, projectName: true } },
          },
        },
      },
    });
  }

  findRecentProjects(where: Prisma.ProjectWhereInput, take: number) {
    return this.prisma.project.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findRecentLeads(where: Prisma.LeadWhereInput, take: number) {
    return this.prisma.lead.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findRecentQuotations(where: Prisma.QuotationWhereInput, take: number) {
    return this.prisma.quotation.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findRecentDocuments(where: Prisma.DocumentWhereInput, take: number) {
    return this.prisma.document.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
        category: { select: { categoryName: true } },
      },
    });
  }

  findRecentMilestones(where: Prisma.MilestoneWhereInput, take: number) {
    return this.prisma.milestone.findMany({
      where,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  findProjectsForCompletionReport(args: Prisma.ProjectFindManyArgs) {
    return this.prisma.project.findMany({
      ...args,
      include: {
        milestones: {
          include: {
            tasks: {
              select: { id: true, status: true },
            },
          },
        },
      },
    });
  }

  countProjectsForReport(where: Prisma.ProjectWhereInput) {
    return this.prisma.project.count({ where });
  }

  aggregateExpenses(where: Prisma.ExpenseWhereInput) {
    return this.prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });
  }

  groupExpensesByProject(where: Prisma.ExpenseWhereInput) {
    return this.prisma.expense.groupBy({
      by: ['projectId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
  }

  findProjectsByIds(projectIds: string[]) {
    return this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, projectName: true },
    });
  }

  findOverdueInvoices(args: Prisma.InvoiceFindManyArgs) {
    return this.prisma.invoice.findMany({
      ...args,
      include: {
        customer: { select: { id: true, fullName: true } },
        project: { select: { id: true, projectName: true } },
      },
    });
  }

  countOverdueInvoices(where: Prisma.InvoiceWhereInput) {
    return this.prisma.invoice.count({ where });
  }
}
