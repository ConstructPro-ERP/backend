import { BadRequestException } from '@nestjs/common';
import {
  InvoiceStatus,
  QuotationStatus,
} from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './repositories/analytics.repository';

const repository = {
  aggregateInvoices: jest.fn(),
  countProjects: jest.fn(),
  groupInvoiceStatuses: jest.fn(),
  countLeads: jest.fn(),
  countConvertedLeads: jest.fn(),
  groupQuotationStatuses: jest.fn(),
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(
      repository as unknown as AnalyticsRepository,
    );
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
});
