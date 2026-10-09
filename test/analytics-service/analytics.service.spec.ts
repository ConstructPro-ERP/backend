import { BadRequestException } from '@nestjs/common';
import {
  InvoiceStatus,
  MilestoneStatus,
  ProjectStatus,
  QuotationStatus,
} from '@prisma/client';
import { AnalyticsService } from '../../apps/analytics-service/src/analytics.service';
import {
  ActivityTypeDto,
  ExpenseReportQueryDto,
  ExpenseReportSortByDto,
  ProjectCompletionReportQueryDto,
  OverdueInvoiceReportQueryDto,
  RecentActivityQueryDto,
  SortOrderDto,
} from '../../apps/analytics-service/src/dto/reporting-query.dto';
import { AnalyticsRepository } from '../../apps/analytics-service/src/repositories/analytics.repository';

const repository = {
  aggregateInvoices: jest.fn(),
  countProjects: jest.fn(),
  groupInvoiceStatuses: jest.fn(),
  countLeads: jest.fn(),
  countConvertedLeads: jest.fn(),
  groupQuotationStatuses: jest.fn(),
  findRecentInvoices: jest.fn(),
  findRecentPayments: jest.fn(),
  findRecentProjects: jest.fn(),
  findRecentLeads: jest.fn(),
  findRecentQuotations: jest.fn(),
  findRecentDocuments: jest.fn(),
  findRecentMilestones: jest.fn(),
  findProjectsForCompletionReport: jest.fn(),
  countProjectsForReport: jest.fn(),
  aggregateExpenses: jest.fn(),
  groupExpensesByProject: jest.fn(),
  findProjectsByIds: jest.fn(),
  findOverdueInvoices: jest.fn(),
  countOverdueInvoices: jest.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(
      repository as unknown as AnalyticsRepository,
    );
  });

  function emptyRepository() {
    repository.aggregateInvoices.mockResolvedValue({
      _sum: { totalAmount: null, paidAmount: null, outstandingAmount: null },
    });
    repository.countProjects.mockResolvedValue(0);
    repository.groupInvoiceStatuses.mockResolvedValue([]);
    repository.countLeads.mockResolvedValue(0);
    repository.countConvertedLeads.mockResolvedValue(0);
    repository.groupQuotationStatuses.mockResolvedValue([]);
    for (const method of [
      repository.findRecentInvoices,
      repository.findRecentPayments,
      repository.findRecentProjects,
      repository.findRecentLeads,
      repository.findRecentQuotations,
      repository.findRecentDocuments,
      repository.findRecentMilestones,
      repository.findProjectsForCompletionReport,
      repository.groupExpensesByProject,
      repository.findProjectsByIds,
      repository.findOverdueInvoices,
    ])
      method.mockResolvedValue([]);
    repository.countProjectsForReport.mockResolvedValue(0);
    repository.countOverdueInvoices.mockResolvedValue(0);
    repository.aggregateExpenses.mockResolvedValue({
      _sum: { amount: null },
      _count: { _all: 0 },
    });
  }

  it.each([
    {},
    { fromDate: '2026-10-01' },
    { toDate: '2026-10-31' },
    { fromDate: '2026-10-01', toDate: '2026-10-31T12:00:00Z' },
  ])('returns empty reports and applies date boundaries %j', async (dates) => {
    emptyRepository();
    await service.dashboardSummary(dates);
    const reports = await Promise.all([
      service.recentActivity(
        Object.assign(new RecentActivityQueryDto(), dates),
      ),
      service.projectCompletionReport(
        Object.assign(new ProjectCompletionReportQueryDto(), dates),
      ),
      service.expenseReport(Object.assign(new ExpenseReportQueryDto(), dates)),
      service.overdueInvoiceReport(
        Object.assign(new OverdueInvoiceReportQueryDto(), dates),
      ),
    ]);
    for (const report of reports)
      expect(report).toMatchObject({ items: [], total: 0, totalPages: 0 });
    expect(repository.aggregateInvoices).toHaveBeenCalledWith({
      invoiceDate:
        dates.fromDate || dates.toDate
          ? {
              gte: dates.fromDate ? new Date(dates.fromDate) : undefined,
              lte: dates.toDate
                ? new Date(
                    dates.toDate.length === 10
                      ? `${dates.toDate}T23:59:59.999Z`
                      : dates.toDate,
                  )
                : undefined,
            }
          : undefined,
    });
  });

  it.each(Object.values(ExpenseReportSortByDto))(
    'sorts grouped expenses by %s in both directions',
    async (sortBy) => {
      repository.aggregateExpenses.mockResolvedValue({
        _sum: { amount: 120 },
        _count: { _all: 3 },
      });
      repository.groupExpensesByProject.mockResolvedValue([
        {
          projectId: 'p1',
          _sum: { amount: null },
          _count: { _all: 1 },
          _min: { createdAt: null },
          _max: { createdAt: null },
        },
        {
          projectId: 'p2',
          _sum: { amount: 120 },
          _count: { _all: 2 },
          _min: { createdAt: new Date('2026-10-01') },
          _max: { createdAt: new Date('2026-10-02') },
        },
      ]);
      repository.findProjectsByIds.mockResolvedValue([
        { id: 'p2', projectName: 'Alpha' },
      ]);
      const asc = await service.expenseReport(
        Object.assign(new ExpenseReportQueryDto(), {
          sortBy,
          sortOrder: SortOrderDto.ASC,
        }),
      );
      const desc = await service.expenseReport(
        Object.assign(new ExpenseReportQueryDto(), {
          sortBy,
          sortOrder: SortOrderDto.DESC,
        }),
      );
      expect(asc.items.map((item) => item.projectId)).toEqual(
        sortBy === ExpenseReportSortByDto.PROJECT_NAME
          ? ['p2', 'p1']
          : ['p1', 'p2'],
      );
      expect(desc.items.map((item) => item.projectId)).toEqual(
        [...asc.items.map((item) => item.projectId)].reverse(),
      );
      expect(asc.summary).toMatchObject({
        totalExpense: 120,
        totalExpenseCount: 3,
      });
      expect(asc.items.find((item) => item.projectId === 'p1')).toMatchObject({
        projectName: 'Unknown project',
        totalExpense: 0,
        firstExpenseAt: null,
        lastExpenseAt: null,
      });
    },
  );

  it('returns zero-valued dashboard KPIs for an empty database', async () => {
    repository.aggregateInvoices.mockResolvedValue({
      _sum: { totalAmount: null, paidAmount: null, outstandingAmount: null },
    });
    repository.countProjects.mockResolvedValue(0);
    repository.groupInvoiceStatuses.mockResolvedValue([]);
    repository.countLeads.mockResolvedValue(0);
    repository.countConvertedLeads.mockResolvedValue(0);
    repository.groupQuotationStatuses.mockResolvedValue([]);
    const summary = await service.dashboardSummary({});
    expect(summary.revenue).toMatchObject({
      totalRevenue: 0,
      paidAmount: 0,
      outstandingBalance: 0,
    });
    expect(summary.projects).toMatchObject({
      totalProjects: 0,
      completionRate: 0,
      overdueProjectCount: 0,
    });
    expect(summary.invoices).toMatchObject({ totalInvoices: 0, paidCount: 0 });
    expect(summary.sales).toMatchObject({
      totalLeads: 0,
      leadConversionRate: 0,
      totalQuotations: 0,
    });
    expect(JSON.stringify(summary)).not.toContain('NaN');
  });

  it('returns revenue KPIs from invoice aggregates', async () => {
    repository.aggregateInvoices.mockResolvedValue({
      _sum: {
        totalAmount: { toNumber: () => 10000 },
        paidAmount: { toNumber: () => 7500 },
        outstandingAmount: { toNumber: () => 2500 },
      },
    });

    await expect(service.revenueKpis({})).resolves.toMatchObject({
      totalRevenue: 10000,
      paidAmount: 7500,
      outstandingBalance: 2500,
    });
  });

  it('returns project KPIs including overdue and completion rate', async () => {
    repository.countProjects
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await expect(service.projectKpis({})).resolves.toMatchObject({
      totalProjects: 8,
      activeProjectCount: 3,
      completedProjectCount: 2,
      overdueProjectCount: 1,
      completionRate: 25,
    });
  });

  it('maps invoice status group counts into the invoice KPI payload', async () => {
    repository.groupInvoiceStatuses.mockResolvedValue([
      { status: InvoiceStatus.DRAFT, _count: { _all: 1 } },
      { status: InvoiceStatus.ISSUED, _count: { _all: 2 } },
      { status: InvoiceStatus.PARTIALLY_PAID, _count: { _all: 3 } },
      { status: InvoiceStatus.PAID, _count: { _all: 4 } },
      { status: InvoiceStatus.OVERDUE, _count: { _all: 5 } },
      { status: InvoiceStatus.CANCELLED, _count: { _all: 6 } },
    ]);

    await expect(service.invoiceKpis({})).resolves.toMatchObject({
      draftCount: 1,
      issuedCount: 2,
      partiallyPaidCount: 3,
      paidCount: 4,
      overdueCount: 5,
      cancelledCount: 6,
      totalInvoices: 21,
    });
  });

  it('returns sales KPIs with converted lead rate and quotation counts', async () => {
    repository.countLeads.mockResolvedValue(10);
    repository.countConvertedLeads.mockResolvedValue(4);
    repository.groupQuotationStatuses.mockResolvedValue([
      { status: QuotationStatus.APPROVED, _count: { _all: 2 } },
      { status: QuotationStatus.REJECTED, _count: { _all: 1 } },
      { status: QuotationStatus.CONVERTED, _count: { _all: 3 } },
      { status: QuotationStatus.PENDING_APPROVAL, _count: { _all: 4 } },
    ]);

    await expect(service.salesKpis({})).resolves.toMatchObject({
      totalLeads: 10,
      convertedLeads: 4,
      leadConversionRate: 40,
      quotationApprovalCount: 5,
      rejectedQuotationCount: 1,
      convertedQuotationCount: 3,
      totalQuotations: 10,
    });
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.dashboardSummary({
        fromDate: '2026-07-01',
        toDate: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('merges recent activity items and paginates them safely', async () => {
    repository.findRecentInvoices.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: InvoiceStatus.ISSUED,
        totalAmount: { toNumber: () => 1000 },
        createdAt: new Date('2026-06-20T10:00:00Z'),
        project: { id: 'proj-1', projectName: 'Alpha' },
      },
    ]);
    repository.findRecentPayments.mockResolvedValue([
      {
        id: 'pay-1',
        referenceNumber: 'PAY-001',
        amount: { toNumber: () => 500 },
        createdAt: new Date('2026-06-21T09:00:00Z'),
        invoice: { project: { id: 'proj-1', projectName: 'Alpha' } },
      },
    ]);
    repository.findRecentProjects.mockResolvedValue([]);
    repository.findRecentLeads.mockResolvedValue([]);
    repository.findRecentQuotations.mockResolvedValue([]);
    repository.findRecentDocuments.mockResolvedValue([]);
    repository.findRecentMilestones.mockResolvedValue([]);

    await expect(
      service.recentActivity({
        page: 1,
        limit: 10,
        activityTypes: [ActivityTypeDto.INVOICE, ActivityTypeDto.PAYMENT],
      }),
    ).resolves.toMatchObject({
      total: 2,
      page: 1,
      limit: 10,
      items: [
        expect.objectContaining({ type: ActivityTypeDto.PAYMENT }),
        expect.objectContaining({ type: ActivityTypeDto.INVOICE }),
      ],
    });
  });

  it('returns project completion report items with milestone percentages', async () => {
    repository.findProjectsForCompletionReport.mockResolvedValue([
      {
        id: 'proj-1',
        projectName: 'Alpha',
        status: ProjectStatus.ACTIVE,
        startDate: new Date('2026-06-01T00:00:00Z'),
        endDate: null,
        budget: 100000,
        milestones: [
          {
            id: 'ms-1',
            milestoneName: 'Foundation',
            status: MilestoneStatus.COMPLETED,
            dueDate: null,
            tasks: [
              { id: 't-1', status: 'COMPLETED' },
              { id: 't-2', status: 'COMPLETED' },
            ],
          },
          {
            id: 'ms-2',
            milestoneName: 'Finishing',
            status: MilestoneStatus.IN_PROGRESS,
            dueDate: null,
            tasks: [
              { id: 't-3', status: 'COMPLETED' },
              { id: 't-4', status: 'TODO' },
            ],
          },
        ],
      },
    ]);
    repository.countProjectsForReport.mockResolvedValue(1);

    await expect(
      service.projectCompletionReport(
        Object.assign(new ProjectCompletionReportQueryDto(), {
          page: 1,
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          projectId: 'proj-1',
          milestoneCount: 2,
          completedMilestoneCount: 1,
          completionPercentage: 50,
        }),
      ],
    });
  });

  it('returns grouped expense report totals', async () => {
    repository.aggregateExpenses.mockResolvedValue({
      _sum: { amount: 950.45 },
      _count: { _all: 3 },
    });
    repository.groupExpensesByProject.mockResolvedValue([
      {
        projectId: 'proj-1',
        _sum: { amount: 600.25 },
        _count: { _all: 2 },
        _min: { createdAt: new Date('2026-06-01T00:00:00Z') },
        _max: { createdAt: new Date('2026-06-03T00:00:00Z') },
      },
      {
        projectId: 'proj-2',
        _sum: { amount: 350.2 },
        _count: { _all: 1 },
        _min: { createdAt: new Date('2026-06-04T00:00:00Z') },
        _max: { createdAt: new Date('2026-06-04T00:00:00Z') },
      },
    ]);
    repository.findProjectsByIds.mockResolvedValue([
      { id: 'proj-1', projectName: 'Alpha' },
      { id: 'proj-2', projectName: 'Beta' },
    ]);

    await expect(
      service.expenseReport({
        page: 1,
        limit: 10,
        sortBy: ExpenseReportSortByDto.TOTAL_EXPENSE,
        sortOrder: SortOrderDto.DESC,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      }),
    ).resolves.toMatchObject({
      total: 2,
      summary: {
        totalExpense: 950.45,
        totalExpenseCount: 3,
      },
      items: [
        expect.objectContaining({ projectId: 'proj-1', totalExpense: 600.25 }),
        expect.objectContaining({ projectId: 'proj-2', totalExpense: 350.2 }),
      ],
    });
  });

  it('returns overdue invoices with joined customer and project details', async () => {
    repository.findOverdueInvoices.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        status: InvoiceStatus.OVERDUE,
        invoiceDate: new Date('2026-05-01T00:00:00Z'),
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        totalAmount: { toNumber: () => 1000 },
        paidAmount: { toNumber: () => 250 },
        outstandingAmount: { toNumber: () => 750 },
        customer: { id: 'cust-1', fullName: 'Client A' },
        project: { id: 'proj-1', projectName: 'Alpha' },
      },
    ]);
    repository.countOverdueInvoices.mockResolvedValue(1);

    await expect(
      service.overdueInvoiceReport(
        Object.assign(new OverdueInvoiceReportQueryDto(), {
          page: 1,
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          invoiceId: 'inv-1',
          customerName: 'Client A',
          projectName: 'Alpha',
          outstandingAmount: 750,
        }),
      ],
    });
  });
});
