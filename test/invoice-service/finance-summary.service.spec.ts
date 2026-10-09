import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { FinanceSummaryService } from '../../apps/invoice-service/src/finance-summary.service';
import { FinanceSummaryRepository } from '../../apps/invoice-service/src/repositories/finance-summary.repository';
import {
  FinanceDateRangeQueryDto,
  OutstandingInvoiceReportQueryDto,
  OutstandingInvoiceSortByDto,
  SortOrderDto,
} from '../../apps/invoice-service/src/dto/finance-report-query.dto';

const repository = {
  findCustomer: jest.fn(),
  findProject: jest.fn(),
  aggregateInvoices: jest.fn(),
  aggregateExpenses: jest.fn(),
  findOutstandingInvoices: jest.fn(),
  countOutstandingInvoices: jest.fn(),
};

describe('FinanceSummaryService', () => {
  let service: FinanceSummaryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceSummaryService(
      repository as unknown as FinanceSummaryRepository,
    );
  });

  it.each([
    {},
    { fromDate: '2026-10-01' },
    { toDate: '2026-10-31' },
    { fromDate: '2026-10-01', toDate: '2026-10-31T12:00:00Z' },
  ])('handles empty finance summaries and date filters %j', async (dates) => {
    repository.findCustomer.mockResolvedValue({
      id: 'customer-1',
      fullName: 'Acme',
    });
    repository.findProject.mockResolvedValue({
      id: 'project-1',
      projectName: 'Tower',
    });
    repository.aggregateInvoices.mockResolvedValue({
      _sum: { totalAmount: null, paidAmount: null, outstandingAmount: null },
    });
    repository.aggregateExpenses.mockResolvedValue({ _sum: { amount: null } });
    repository.findOutstandingInvoices.mockResolvedValue([]);
    repository.countOutstandingInvoices.mockResolvedValue(0);
    const query: FinanceDateRangeQueryDto = dates;
    await expect(
      service.clientSummary('customer-1', query),
    ).resolves.toMatchObject({
      totalInvoicedAmount: 0,
      totalPaidAmount: 0,
      outstandingBalance: 0,
    });
    await expect(
      service.projectSummary('project-1', query),
    ).resolves.toMatchObject({
      revenue: 0,
      expenseTotal: 0,
      estimatedProfit: 0,
    });
    await expect(
      service.outstandingInvoices(
        Object.assign(new OutstandingInvoiceReportQueryDto(), query),
      ),
    ).resolves.toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
      totalOutstandingAmount: 0,
    });
    expect(repository.aggregateInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
  });

  it('rejects unknown projects before aggregating', async () => {
    repository.findProject.mockResolvedValue(null);
    await expect(service.projectSummary('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.aggregateInvoices).not.toHaveBeenCalled();
  });

  it('returns a client finance summary from invoice aggregates', async () => {
    repository.findCustomer.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000011',
      fullName: 'Acme Construction',
    });
    repository.aggregateInvoices.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal(1500),
        paidAmount: new Prisma.Decimal(900),
        outstandingAmount: new Prisma.Decimal(600),
      },
    });

    const result = await service.clientSummary(
      '00000000-0000-4000-8000-000000000011',
      {
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
    );

    expect(result).toMatchObject({
      totalInvoicedAmount: 1500,
      totalPaidAmount: 900,
      outstandingBalance: 600,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('returns a project finance summary including expenses and estimated profit', async () => {
    repository.findProject.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000021',
      projectName: 'Tower A',
    });
    repository.aggregateInvoices.mockResolvedValue({
      _sum: {
        totalAmount: new Prisma.Decimal(5000),
        paidAmount: new Prisma.Decimal(3500),
        outstandingAmount: new Prisma.Decimal(1500),
      },
    });
    repository.aggregateExpenses.mockResolvedValue({
      _sum: {
        amount: 2100.25,
      },
    });

    const result = await service.projectSummary(
      '00000000-0000-4000-8000-000000000021',
      {},
    );

    expect(result).toMatchObject({
      revenue: 5000,
      paidAmount: 3500,
      outstandingAmount: 1500,
      expenseTotal: 2100.25,
      estimatedProfit: 2899.75,
    });
  });

  it('returns an outstanding invoice report with totals and pagination', async () => {
    repository.findOutstandingInvoices.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000031',
        projectId: '00000000-0000-4000-8000-000000000032',
        customerId: '00000000-0000-4000-8000-000000000033',
        invoiceDate: new Date('2026-06-20T00:00:00.000Z'),
        dueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal(2000),
        paidAmount: new Prisma.Decimal(750),
        outstandingAmount: new Prisma.Decimal(1250),
        status: InvoiceStatus.PARTIALLY_PAID,
        project: {
          id: '00000000-0000-4000-8000-000000000032',
          projectName: 'Tower A',
        },
        customer: {
          id: '00000000-0000-4000-8000-000000000033',
          fullName: 'Acme Construction',
        },
      },
    ]);
    repository.countOutstandingInvoices.mockResolvedValue(1);
    repository.aggregateInvoices.mockResolvedValue({
      _sum: {
        outstandingAmount: new Prisma.Decimal(1250),
      },
    });

    const result = await service.outstandingInvoices({
      page: 1,
      limit: 20,
      sortBy: OutstandingInvoiceSortByDto.DUE_DATE,
      sortOrder: SortOrderDto.ASC,
    });

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      totalOutstandingAmount: 1250,
    });
    expect(result.items[0]).toMatchObject({
      projectName: 'Tower A',
      customerName: 'Acme Construction',
      outstandingAmount: 1250,
      status: InvoiceStatus.PARTIALLY_PAID,
    });
  });

  it('rejects an invalid date range', async () => {
    await expect(
      service.clientSummary('00000000-0000-4000-8000-000000000011', {
        fromDate: '2026-07-01',
        toDate: '2026-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown customer', async () => {
    repository.findCustomer.mockResolvedValue(null);

    await expect(
      service.clientSummary('00000000-0000-4000-8000-000000000011', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
