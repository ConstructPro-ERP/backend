import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import {
  FinanceDateRangeQueryDto,
  OutstandingInvoiceReportQueryDto,
} from './dto/finance-report-query.dto';
import { FinanceSummaryRepository } from './repositories/finance-summary.repository';

@Injectable()
export class FinanceSummaryService {
  constructor(private readonly reports: FinanceSummaryRepository) {}

  async clientSummary(customerId: string, query: FinanceDateRangeQueryDto) {
    this.validateDateRange(query.fromDate, query.toDate);

    const customer = await this.reports.findCustomer(customerId);
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found.',
      });
    }

    const invoiceWhere = buildInvoiceDateRangeWhere(customerId, query);
    const totals = await this.reports.aggregateInvoices(invoiceWhere);

    return {
      customerId: customer.id,
      customerName: customer.fullName,
      totalInvoicedAmount: money(totals._sum.totalAmount),
      totalPaidAmount: money(totals._sum.paidAmount),
      outstandingBalance: money(totals._sum.outstandingAmount),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async projectSummary(projectId: string, query: FinanceDateRangeQueryDto) {
    this.validateDateRange(query.fromDate, query.toDate);

    const project = await this.reports.findProject(projectId);
    if (!project) {
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found.',
      });
    }

    const invoiceTotals = await this.reports.aggregateInvoices(
      buildInvoiceDateRangeWhere(undefined, query, projectId),
    );
    const expenseTotals = await this.reports.aggregateExpenses(
      projectId,
      query,
    );

    const revenue = money(invoiceTotals._sum.totalAmount);
    const paidAmount = money(invoiceTotals._sum.paidAmount);
    const outstandingAmount = money(invoiceTotals._sum.outstandingAmount);
    const expenseTotal = money(expenseTotals._sum.amount);

    return {
      projectId: project.id,
      projectName: project.projectName,
      revenue,
      paidAmount,
      outstandingAmount,
      expenseTotal,
      estimatedProfit: roundCurrency(revenue - expenseTotal),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  async outstandingInvoices(query: OutstandingInvoiceReportQueryDto) {
    this.validateDateRange(query.fromDate, query.toDate);

    const where = buildOutstandingWhere(query);
    const [items, total, aggregate] = await Promise.all([
      this.reports.findOutstandingInvoices({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { [query.sortBy]: query.sortOrder },
      }),
      this.reports.countOutstandingInvoices(where),
      this.reports.aggregateInvoices(where),
    ]);

    return {
      items: items.map((invoice) => ({
        id: invoice.id,
        projectId: invoice.projectId,
        customerId: invoice.customerId,
        projectName: invoice.project.projectName,
        customerName: invoice.customer.fullName,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: money(invoice.totalAmount),
        paidAmount: money(invoice.paidAmount),
        outstandingAmount: money(invoice.outstandingAmount),
        status: invoice.status,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      totalOutstandingAmount: money(aggregate._sum.outstandingAmount),
      fromDate: query.fromDate ?? null,
      toDate: query.toDate ?? null,
    };
  }

  private validateDateRange(fromDate?: string, toDate?: string) {
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'toDate cannot be before fromDate.',
      });
    }
  }
}

function buildInvoiceDateRangeWhere(
  customerId: string | undefined,
  query: FinanceDateRangeQueryDto,
  projectId?: string,
): Prisma.InvoiceWhereInput {
  return {
    customerId,
    projectId,
    invoiceDate:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfRequestedDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function buildOutstandingWhere(
  query: FinanceDateRangeQueryDto,
): Prisma.InvoiceWhereInput {
  return {
    status: {
      in: [
        InvoiceStatus.ISSUED,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.OVERDUE,
      ],
    },
    outstandingAmount: {
      gt: 0,
    },
    invoiceDate:
      query.fromDate || query.toDate
        ? {
            gte: query.fromDate ? new Date(query.fromDate) : undefined,
            lte: query.toDate ? endOfRequestedDay(query.toDate) : undefined,
          }
        : undefined,
  };
}

function endOfRequestedDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T23:59:59.999Z`);
}

function money(value: Prisma.Decimal | number | null | undefined): number {
  return roundCurrency(Number(value ?? 0));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
