import { InvoiceStatus } from '@prisma/client';
import { InvoiceRepository } from '../../apps/invoice-service/src/repositories/invoice.repository';
import { FinanceSummaryRepository } from '../../apps/invoice-service/src/repositories/finance-summary.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, objectContaining } from '../support/prisma.mock';

describe('Invoice repositories', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let invoices: InvoiceRepository;
  let summary: FinanceSummaryRepository;
  beforeEach(() => {
    prisma = createPrismaMock();
    invoices = new InvoiceRepository(prisma as unknown as PrismaService);
    summary = new FinanceSummaryRepository(prisma as unknown as PrismaService);
  });

  it('loads the project quotation customer needed to associate invoices', async () => {
    await invoices.findProjectWithCustomer('p1');
    expect(prisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      include: {
        quotations: { include: { lead: { include: { customer: true } } } },
      },
    });
    await invoices.findCustomer('c1');
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('exposes minimal creation choices and deduplicates project customer relationships', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: 'p1',
        projectName: 'Site A',
        quotations: [
          { lead: { customer: { id: 'c1' } } },
          { lead: { customer: { id: 'c1' } } },
          { lead: { customer: null } },
        ],
      },
      { id: 'p2', projectName: 'Site B', quotations: [] },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'c1', fullName: 'Alice' },
    ]);
    await expect(invoices.creationOptions()).resolves.toEqual({
      projects: [
        { id: 'p1', projectName: 'Site A', customerIds: ['c1'] },
        { id: 'p2', projectName: 'Site B', customerIds: [] },
      ],
      customers: [{ id: 'c1', fullName: 'Alice' }],
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    });
  });

  it('preserves invoice data, joined details and PDF metadata during create/read/update', async () => {
    const data = {
      projectId: 'p1',
      customerId: 'c1',
      invoiceDate: new Date('2026-10-01'),
      totalAmount: 50,
      paidAmount: 0,
      outstandingAmount: 50,
      status: InvoiceStatus.DRAFT,
    };
    await invoices.create(data);
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      objectContaining({
        data,
        include: objectContaining({
          payments: expect.any(Object) as unknown,
          project: expect.any(Object) as unknown,
          customer: expect.any(Object) as unknown,
        }),
      }),
    );
    await invoices.findById('i1');
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'i1' },
        include: expect.any(Object) as unknown,
      }),
    );
    const pdf = {
      pdfUrl: 'https://files.test/invoice.pdf',
      pdfPath: 'invoices/i1.pdf',
      updatedBy: 'actor',
    };
    await invoices.update('i1', pdf);
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      objectContaining({ where: { id: 'i1' }, data: pdf }),
    );
  });

  it('uses matching filters for paginated invoices and their transactional count', async () => {
    prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    prisma.invoice.findMany.mockResolvedValue([{ id: 'i1' }]);
    prisma.invoice.count.mockResolvedValue(3);
    const args = {
      where: { projectId: 'p1' },
      skip: 10,
      take: 5,
      orderBy: { invoiceDate: 'desc' as const },
    };
    await expect(invoices.findManyAndCount(args)).resolves.toEqual([
      [{ id: 'i1' }],
      3,
    ]);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      objectContaining(args),
    );
    expect(prisma.invoice.count).toHaveBeenCalledWith({ where: args.where });
    await invoices.countByInvoiceNumberPrefix('INV-202610-');
    expect(prisma.invoice.count).toHaveBeenLastCalledWith({
      where: { invoiceNumber: { startsWith: 'INV-202610-' } },
    });
  });

  it('scopes finance aggregates and outstanding reports to their requested filters', async () => {
    await summary.findCustomer('c1');
    await summary.findProject('p1');
    expect(prisma.customer.findUnique).toHaveBeenCalledWith(
      objectContaining({ where: { id: 'c1' } }),
    );
    expect(prisma.project.findUnique).toHaveBeenCalledWith(
      objectContaining({ where: { id: 'p1' } }),
    );
    const where = { projectId: 'p1', outstandingAmount: { gt: 0 } };
    await summary.aggregateInvoices(where);
    expect(prisma.invoice.aggregate).toHaveBeenCalledWith({
      where,
      _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true },
    });
    const args = {
      where,
      skip: 2,
      take: 3,
      orderBy: { dueDate: 'asc' as const },
    };
    await summary.findOutstandingInvoices(args);
    await summary.countOutstandingInvoices(where);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      objectContaining(args),
    );
    expect(prisma.invoice.count).toHaveBeenCalledWith({ where });
  });

  it.each([
    [{}, undefined],
    [
      { fromDate: '2026-10-01' },
      { gte: new Date('2026-10-01'), lte: undefined },
    ],
    [
      { toDate: '2026-10-02' },
      { gte: undefined, lte: new Date('2026-10-02T23:59:59.999Z') },
    ],
    [
      { fromDate: '2026-10-01', toDate: '2026-10-02T12:00:00Z' },
      { gte: new Date('2026-10-01'), lte: new Date('2026-10-02T12:00:00Z') },
    ],
  ])(
    'applies expense date boundaries without dropping the project scope: %j',
    async (query, createdAt) => {
      await summary.aggregateExpenses('p1', query);
      expect(prisma.expense.aggregate).toHaveBeenCalledWith({
        where: { projectId: 'p1', createdAt },
        _sum: { amount: true },
      });
    },
  );
});
