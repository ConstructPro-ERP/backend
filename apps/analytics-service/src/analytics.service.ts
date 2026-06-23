import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  ProjectStatus,
  QuotationStatus,
  type Prisma,
} from '@prisma/client';
import { KpiQueryDto } from './dto/kpi-query.dto';
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

function endOfDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T23:59:59.999Z`);
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
