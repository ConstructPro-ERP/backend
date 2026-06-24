import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  ProjectStatus,
  QuotationStatus,
  TaskStatus,
  type Prisma,
} from '@prisma/client';
import { KpiQueryDto } from './dto/kpi-query.dto';
import {
  ActivityTypeDto,
  ExpenseReportQueryDto,
  ExpenseReportSortByDto,
  OverdueInvoiceReportQueryDto,
  OverdueInvoiceSortByDto,
  ProjectCompletionReportQueryDto,
  ProjectCompletionSortByDto,
  RecentActivityQueryDto,
  SortOrderDto,
} from './dto/reporting-query.dto';
import { AnalyticsRepository } from './repositories/analytics.repository';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async revenueKpis(query: KpiQueryDto) {
    validateDateRange(query);

    const aggregate = await this.analyticsRepository.aggregateInvoices(
      buildInvoiceWhere(query),
    );

    return {
      totalRevenue: money(aggregate._sum.totalAmount),
      paidAmount: money(aggregate._sum.paidAmount),
      outstandingBalance: money(aggregate._sum.outstandingAmount),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async projectKpis(query: KpiQueryDto) {
    validateDateRange(query);

    const totalWhere = buildProjectWhere(query);
    const overdueWhere = {
      ...totalWhere,
      status: {
        notIn: [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
      },
      endDate: {
        lt: new Date(),
      },
    };

    const [totalProjects, activeProjectCount, completedProjectCount, overdue] =
      await Promise.all([
        this.analyticsRepository.countProjects(totalWhere),
        this.analyticsRepository.countProjects({
          ...totalWhere,
          status: ProjectStatus.ACTIVE,
        }),
        this.analyticsRepository.countProjects({
          ...totalWhere,
          status: ProjectStatus.COMPLETED,
        }),
        this.analyticsRepository.countProjects(overdueWhere),
      ]);

    return {
      totalProjects,
      activeProjectCount,
      completedProjectCount,
      overdueProjectCount: overdue,
      completionRate:
        totalProjects === 0
          ? 0
          : round2((completedProjectCount / totalProjects) * 100),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async invoiceKpis(query: KpiQueryDto) {
    validateDateRange(query);

    const groups = await this.analyticsRepository.groupInvoiceStatuses(
      buildInvoiceWhere(query),
    );

    return {
      draftCount: countStatus(groups, InvoiceStatus.DRAFT),
      issuedCount: countStatus(groups, InvoiceStatus.ISSUED),
      partiallyPaidCount: countStatus(groups, InvoiceStatus.PARTIALLY_PAID),
      paidCount: countStatus(groups, InvoiceStatus.PAID),
      overdueCount: countStatus(groups, InvoiceStatus.OVERDUE),
      cancelledCount: countStatus(groups, InvoiceStatus.CANCELLED),
      totalInvoices: groups.reduce((sum, item) => sum + item._count._all, 0),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async salesKpis(query: KpiQueryDto) {
    validateDateRange(query);

    const leadWhere = buildLeadWhere(query);
    const quotationWhere = buildQuotationWhere(query);

    const [totalLeads, convertedLeads, quotationGroups] = await Promise.all([
      this.analyticsRepository.countLeads(leadWhere),
      this.analyticsRepository.countConvertedLeads(leadWhere),
      this.analyticsRepository.groupQuotationStatuses(quotationWhere),
    ]);

    return {
      totalLeads,
      convertedLeads,
      leadConversionRate:
        totalLeads === 0 ? 0 : round2((convertedLeads / totalLeads) * 100),
      quotationApprovalCount:
        countStatus(quotationGroups, QuotationStatus.APPROVED) +
        countStatus(quotationGroups, QuotationStatus.CONVERTED),
      rejectedQuotationCount: countStatus(
        quotationGroups,
        QuotationStatus.REJECTED,
      ),
      convertedQuotationCount: countStatus(
        quotationGroups,
        QuotationStatus.CONVERTED,
      ),
      totalQuotations: quotationGroups.reduce(
        (sum, item) => sum + item._count._all,
        0,
      ),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async dashboardSummary(query: KpiQueryDto) {
    const [revenue, projects, invoices, sales] = await Promise.all([
      this.revenueKpis(query),
      this.projectKpis(query),
      this.invoiceKpis(query),
      this.salesKpis(query),
    ]);

    return { revenue, projects, invoices, sales };
  }

  async recentActivity(query: RecentActivityQueryDto) {
    validateDateRange(query);

    const page = query.page;
    const limit = query.limit;
    const types = query.activityTypes?.length
      ? query.activityTypes
      : Object.values(ActivityTypeDto);
    const take = Math.min(page * limit, 100);

    const [
      invoices,
      payments,
      projects,
      leads,
      quotations,
      documents,
      milestones,
    ] = await Promise.all([
      types.includes(ActivityTypeDto.INVOICE)
        ? this.analyticsRepository.findRecentInvoices(
            buildInvoiceWhere(query),
            take,
          )
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.PAYMENT)
        ? this.analyticsRepository.findRecentPayments(
            buildPaymentWhere(query),
            take,
          )
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.PROJECT)
        ? this.analyticsRepository.findRecentProjects(
            buildProjectWhere(query),
            take,
          )
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.LEAD)
        ? this.analyticsRepository.findRecentLeads(buildLeadWhere(query), take)
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.QUOTATION)
        ? this.analyticsRepository.findRecentQuotations(
            buildQuotationWhere(query),
            take,
          )
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.DOCUMENT)
        ? this.analyticsRepository.findRecentDocuments(
            buildDocumentWhere(query),
            take,
          )
        : Promise.resolve([]),
      types.includes(ActivityTypeDto.MILESTONE)
        ? this.analyticsRepository.findRecentMilestones(
            buildMilestoneWhere(query),
            take,
          )
        : Promise.resolve([]),
    ]);

    const items = [
      ...invoices.map((invoice) => ({
        type: ActivityTypeDto.INVOICE,
        entityId: invoice.id,
        title: invoice.invoiceNumber
          ? `Invoice ${invoice.invoiceNumber}`
          : 'Invoice created',
        description: `Invoice ${invoice.status} for ${money(invoice.totalAmount)}`,
        occurredAt: invoice.createdAt,
        relatedProjectId: invoice.project.id,
        relatedProjectName: invoice.project.projectName,
      })),
      ...payments.map((payment) => ({
        type: ActivityTypeDto.PAYMENT,
        entityId: payment.id,
        title: `Payment ${payment.referenceNumber}`,
        description: `Payment of ${money(payment.amount)} recorded`,
        occurredAt: payment.createdAt,
        relatedProjectId: payment.invoice?.project.id ?? null,
        relatedProjectName: payment.invoice?.project.projectName ?? null,
      })),
      ...projects.map((project) => ({
        type: ActivityTypeDto.PROJECT,
        entityId: project.id,
        title: project.projectName,
        description: `Project ${project.status.toLowerCase().replace('_', ' ')}`,
        occurredAt: project.createdAt,
        relatedProjectId: project.id,
        relatedProjectName: project.projectName,
      })),
      ...leads.map((lead) => ({
        type: ActivityTypeDto.LEAD,
        entityId: lead.id,
        title: lead.customerName,
        description: `Lead ${lead.status.toLowerCase()}`,
        occurredAt: lead.createdAt,
        relatedProjectId: null,
        relatedProjectName: null,
      })),
      ...quotations.map((quotation) => ({
        type: ActivityTypeDto.QUOTATION,
        entityId: quotation.id,
        title: `Quotation ${quotation.id.slice(0, 8)}`,
        description: `Quotation ${quotation.status.toLowerCase().replace('_', ' ')} for ${money(quotation.totalAmount)}`,
        occurredAt: quotation.createdAt,
        relatedProjectId: quotation.project?.id ?? null,
        relatedProjectName: quotation.project?.projectName ?? null,
      })),
      ...documents.map((document) => ({
        type: ActivityTypeDto.DOCUMENT,
        entityId: document.id,
        title: document.fileName,
        description: `${document.category.categoryName} uploaded`,
        occurredAt: document.createdAt,
        relatedProjectId: document.project.id,
        relatedProjectName: document.project.projectName,
      })),
      ...milestones.map((milestone) => ({
        type: ActivityTypeDto.MILESTONE,
        entityId: milestone.id,
        title: milestone.milestoneName,
        description: `Milestone ${milestone.status.toLowerCase().replace('_', ' ')}`,
        occurredAt: milestone.createdAt,
        relatedProjectId: milestone.project.id,
        relatedProjectName: milestone.project.projectName,
      })),
    ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const total = items.length;
    const pagedItems = items.slice((page - 1) * limit, page * limit);

    return {
      items: pagedItems,
      total,
      page,
      limit,
      totalPages: totalPages(total, limit),
    };
  }

  async projectCompletionReport(query: ProjectCompletionReportQueryDto) {
    validateDateRange(query);

    const where: Prisma.ProjectWhereInput = {
      ...buildProjectWhere(query),
      projectManagerId: query.projectManagerId,
      status: query.status,
    };
    const orderBy = projectCompletionOrderBy(query);

    const [items, total] = await Promise.all([
      this.analyticsRepository.findProjectsForCompletionReport({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.analyticsRepository.countProjectsForReport(where),
    ]);

    return {
      items: items.map((project) => {
        const milestoneCount = project.milestones.length;
        const completedMilestoneCount = project.milestones.filter(
          (milestone) => milestone.status === 'COMPLETED',
        ).length;
        const milestones = project.milestones.map((milestone) => {
          const taskCount = milestone.tasks.length;
          const completedTaskCount = milestone.tasks.filter(
            (task) => task.status === TaskStatus.COMPLETED,
          ).length;
          const completionPercentage =
            taskCount === 0 ? 0 : round2((completedTaskCount / taskCount) * 100);

          return {
            id: milestone.id,
            milestoneName: milestone.milestoneName,
            status: milestone.status,
            dueDate: milestone.dueDate,
            taskCount,
            completedTaskCount,
            completionPercentage,
          };
        });

        return {
          projectId: project.id,
          projectName: project.projectName,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          budget: project.budget,
          milestoneCount,
          completedMilestoneCount,
          completionPercentage:
            milestoneCount === 0
              ? 0
              : round2((completedMilestoneCount / milestoneCount) * 100),
          milestones,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: totalPages(total, query.limit),
    };
  }

  async expenseReport(query: ExpenseReportQueryDto) {
    validateDateRange(query);

    const where: Prisma.ExpenseWhereInput = {
      projectId: query.projectId,
      recordedById: query.recordedById,
      createdAt:
        query.fromDate || query.toDate
          ? {
              gte: query.fromDate ? new Date(query.fromDate) : undefined,
              lte: query.toDate ? endOfDay(query.toDate) : undefined,
            }
          : undefined,
    };

    const [aggregate, groups] = await Promise.all([
      this.analyticsRepository.aggregateExpenses(where),
      this.analyticsRepository.groupExpensesByProject(where),
    ]);

    const projectMap = new Map(
      (
        await this.analyticsRepository.findProjectsByIds(
          groups.map((group) => group.projectId),
        )
      ).map((project) => [project.id, project.projectName]),
    );

    const items = groups
      .map((group) => ({
        projectId: group.projectId,
        projectName: projectMap.get(group.projectId) ?? 'Unknown project',
        totalExpense: round2(group._sum.amount ?? 0),
        expenseCount: group._count._all,
        firstExpenseAt: group._min.createdAt ?? null,
        lastExpenseAt: group._max.createdAt ?? null,
      }))
      .sort((left, right) => compareExpenseRows(left, right, query));

    const total = items.length;
    const pagedItems = items.slice(
      (query.page - 1) * query.limit,
      query.page * query.limit,
    );

    return {
      items: pagedItems,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: totalPages(total, query.limit),
      summary: {
        totalExpense: round2(aggregate._sum.amount ?? 0),
        totalExpenseCount: aggregate._count._all,
        fromDate: query.fromDate ?? null,
        toDate: query.toDate ?? null,
      },
    };
  }

  async overdueInvoiceReport(query: OverdueInvoiceReportQueryDto) {
    validateDateRange(query);

    const where: Prisma.InvoiceWhereInput = {
      projectId: query.projectId,
      customerId: query.customerId,
      status: InvoiceStatus.OVERDUE,
      dueDate:
        query.fromDate || query.toDate
          ? {
              gte: query.fromDate ? new Date(query.fromDate) : undefined,
              lte: query.toDate ? endOfDay(query.toDate) : undefined,
            }
          : { lt: new Date() },
    };

    const [items, total] = await Promise.all([
      this.analyticsRepository.findOverdueInvoices({
        where,
        orderBy: overdueInvoiceOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.analyticsRepository.countOverdueInvoices(where),
    ]);

    return {
      items: items.map((invoice) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        outstandingAmount: money(invoice.outstandingAmount),
        totalAmount: money(invoice.totalAmount),
        paidAmount: money(invoice.paidAmount),
        customerId: invoice.customer.id,
        customerName: invoice.customer.fullName,
        projectId: invoice.project.id,
        projectName: invoice.project.projectName,
        daysOverdue: daysOverdue(invoice.dueDate),
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: totalPages(total, query.limit),
    };
  }
}

function validateDateRange(query: KpiQueryDto) {
  if (
    query.fromDate &&
    query.toDate &&
    new Date(query.toDate) < new Date(query.fromDate)
  ) {
    throw new BadRequestException({
      code: 'INVALID_DATE_RANGE',
      message: 'toDate cannot be before fromDate.',
    });
  }
}

function buildInvoiceWhere(query: KpiQueryDto): Prisma.InvoiceWhereInput {
  return {
    invoiceDate:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildProjectWhere(query: KpiQueryDto): Prisma.ProjectWhereInput {
  return {
    createdAt:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildLeadWhere(query: KpiQueryDto): Prisma.LeadWhereInput {
  return {
    createdAt:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildQuotationWhere(query: KpiQueryDto): Prisma.QuotationWhereInput {
  return {
    quotationDate:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildPaymentWhere(query: RecentActivityQueryDto): Prisma.PaymentWhereInput {
  return {
    createdAt:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildDocumentWhere(
  query: RecentActivityQueryDto,
): Prisma.DocumentWhereInput {
  return {
    createdAt:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildMilestoneWhere(
  query: RecentActivityQueryDto,
): Prisma.MilestoneWhereInput {
  return {
    createdAt:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function projectCompletionOrderBy(query: ProjectCompletionReportQueryDto) {
  return {
    [query.sortBy]: query.sortOrder,
  } as Prisma.ProjectOrderByWithRelationInput;
}

function overdueInvoiceOrderBy(query: OverdueInvoiceReportQueryDto) {
  return {
    [query.sortBy]: query.sortOrder,
  } as Prisma.InvoiceOrderByWithRelationInput;
}

function compareExpenseRows(
  left: {
    projectName: string;
    totalExpense: number;
    expenseCount: number;
    lastExpenseAt: Date | null;
  },
  right: {
    projectName: string;
    totalExpense: number;
    expenseCount: number;
    lastExpenseAt: Date | null;
  },
  query: ExpenseReportQueryDto,
) {
  const direction = query.sortOrder === SortOrderDto.ASC ? 1 : -1;

  switch (query.sortBy) {
    case ExpenseReportSortByDto.PROJECT_NAME:
      return left.projectName.localeCompare(right.projectName) * direction;
    case ExpenseReportSortByDto.TOTAL_EXPENSE:
      return (left.totalExpense - right.totalExpense) * direction;
    case ExpenseReportSortByDto.EXPENSE_COUNT:
      return (left.expenseCount - right.expenseCount) * direction;
    case ExpenseReportSortByDto.LAST_EXPENSE_AT:
    default:
      return (
        ((left.lastExpenseAt?.getTime() ?? 0) -
          (right.lastExpenseAt?.getTime() ?? 0)) * direction
      );
  }
}

function endOfDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T23:59:59.999Z`);
}

function totalPages(total: number, limit: number) {
  return total === 0 ? 0 : Math.ceil(total / limit);
}

function daysOverdue(dueDate: Date | null) {
  if (!dueDate) return 0;
  const diff = Date.now() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function money(value: { toNumber(): number } | number | null | undefined) {
  const amount =
    typeof value === 'number'
      ? value
      : value && 'toNumber' in value
        ? value.toNumber()
        : 0;
  return round2(amount);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function countStatus<T extends string>(
  groups: Array<{ status: T; _count: { _all: number } }>,
  status: T,
) {
  return groups.find((item) => item.status === status)?._count._all ?? 0;
}
