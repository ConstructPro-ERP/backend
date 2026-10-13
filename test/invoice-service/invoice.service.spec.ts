import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InvoiceService } from '../../apps/invoice-service/src/invoice.service';
import { InvoicePdfService } from '../../apps/invoice-service/src/pdf/invoice-pdf.service';
import { EditableInvoiceStatusDto } from '../../apps/invoice-service/src/dto/invoice-status.dto';
import { ListInvoicesQueryDto } from '../../apps/invoice-service/src/dto/list-invoices-query.dto';
import { InvoiceRepository } from '../../apps/invoice-service/src/repositories/invoice.repository';
import {
  InvoiceSortByDto,
  SortOrderDto,
} from '../../apps/invoice-service/src/dto/list-invoices-query.dto';

const repository = {
  findProjectWithCustomer: jest.fn(),
  findCustomer: jest.fn(),
  create: jest.fn(),
  findManyAndCount: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  countByInvoiceNumberPrefix: jest.fn(),
};

const pdfService = {
  generate: jest.fn(),
};

const project = {
  id: '00000000-0000-4000-8000-000000000001',
  projectName: 'Tower A',
  location: 'Colombo',
  status: 'ACTIVE',
  quotations: [],
};

const customer = {
  id: '00000000-0000-4000-8000-000000000002',
  fullName: 'Acme Construction',
};

const baseInvoice = {
  id: '00000000-0000-4000-8000-000000000003',
  projectId: project.id,
  customerId: customer.id,
  invoiceDate: new Date('2026-06-22T00:00:00.000Z'),
  dueDate: new Date('2026-07-22T00:00:00.000Z'),
  totalAmount: new Prisma.Decimal(1000),
  paidAmount: new Prisma.Decimal(0),
  outstandingAmount: new Prisma.Decimal(1000),
  invoiceNumber: null,
  pdfPath: null,
  pdfUrl: null,
  pdfGeneratedAt: null,
  notes: null,
  status: InvoiceStatus.DRAFT,
  createdBy: '00000000-0000-4000-8000-000000000004',
  updatedBy: '00000000-0000-4000-8000-000000000004',
  createdAt: new Date('2026-06-22T00:00:00.000Z'),
  updatedAt: new Date('2026-06-22T00:00:00.000Z'),
  project,
  customer,
  payments: [],
};

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceService(
      repository as unknown as InvoiceRepository,
      pdfService as unknown as InvoicePdfService,
    );
    repository.findProjectWithCustomer.mockResolvedValue(project);
    repository.findCustomer.mockResolvedValue(customer);
    repository.countByInvoiceNumberPrefix.mockResolvedValue(0);
  });

  it.each([
    { fromDate: '2026-10-01' },
    { toDate: '2026-10-31' },
    { fromDate: '2026-10-01', toDate: '2026-10-31T12:00:00Z' },
  ])('applies inclusive list dates %j', async (dates) => {
    repository.findManyAndCount.mockResolvedValue([[], 0]);
    const query = Object.assign(new ListInvoicesQueryDto(), dates, {
      sortBy: undefined,
    });
    await expect(service.findAll(query)).resolves.toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
    expect(repository.findManyAndCount).toHaveBeenCalledWith({
      skip: 0,
      take: 20,
      orderBy: { createdAt: SortOrderDto.DESC },
      where: {
        projectId: undefined,
        customerId: undefined,
        status: undefined,
        invoiceDate: {
          gte: dates.fromDate ? new Date(dates.fromDate) : undefined,
          lte: dates.toDate
            ? new Date(
                dates.toDate.length === 10
                  ? `${dates.toDate}T23:59:59.999Z`
                  : dates.toDate,
              )
            : undefined,
        },
      },
    });
  });

  it('issues a project invoice directly and assigns its sequence', async () => {
    repository.create.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.ISSUED,
    });
    await service.createForProject(project.id, {
      customerId: customer.id,
      invoiceDate: '2026-10-01',
      totalAmount: 1000,
      status: EditableInvoiceStatusDto.ISSUED,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'INV-202610-0001',
        projectId: project.id,
      }),
    );
  });

  it('updates dates and ownership and retains an issued invoice number', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.ISSUED,
      invoiceNumber: 'INV-EXISTING',
      dueDate: null,
    });
    repository.update.mockResolvedValue(baseInvoice);
    await service.update(baseInvoice.id, {
      projectId: project.id,
      customerId: customer.id,
      invoiceDate: '2026-10-01',
      dueDate: '2026-10-31',
      totalAmount: 2000,
    });
    expect(repository.update).toHaveBeenCalledWith(
      baseInvoice.id,
      expect.objectContaining({
        invoiceNumber: undefined,
        invoiceDate: new Date('2026-10-01'),
        dueDate: new Date('2026-10-31'),
        outstandingAmount: 2000,
      }),
    );
    expect(repository.findProjectWithCustomer).toHaveBeenCalledWith(project.id);
  });

  it('allows quotations with no customer link', async () => {
    repository.findProjectWithCustomer.mockResolvedValue({
      ...project,
      quotations: [{ lead: { customer: null } }],
    });
    repository.create.mockResolvedValue(baseInvoice);
    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-10-01',
        totalAmount: 1000,
      }),
    ).resolves.toMatchObject({ id: baseInvoice.id });
  });

  it('rejects missing invoice lookups', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findOne(baseInvoice.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    InvoiceStatus.PAID,
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.CANCELLED,
    InvoiceStatus.OVERDUE,
  ])('rejects edits to %s invoices', async (status) => {
    repository.findById.mockResolvedValue({ ...baseInvoice, status });
    await expect(
      service.update(baseInvoice.id, { notes: 'changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects an empty update without writing', async () => {
    repository.findById.mockResolvedValue(baseInvoice);
    await expect(service.update(baseInvoice.id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('treats repeated cancellation as idempotent', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.CANCELLED,
    });
    await expect(service.cancel(baseInvoice.id)).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects PDF generation for cancelled invoices', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.CANCELLED,
    });
    await expect(
      service.generatePdf(baseInvoice.id, {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pdfService.generate).not.toHaveBeenCalled();
  });

  it('reuses cached PDFs unless force regeneration is requested', async () => {
    const invoice = {
      ...baseInvoice,
      invoiceNumber: 'INV-CACHED',
      pdfUrl: 'https://files.test/cached.pdf',
    };
    repository.findById.mockResolvedValue(invoice);
    await expect(
      service.generatePdf(baseInvoice.id, {}),
    ).resolves.toMatchObject({ pdfUrl: invoice.pdfUrl });
    expect(pdfService.generate).not.toHaveBeenCalled();
    pdfService.generate.mockResolvedValue({
      filePath: 'new.pdf',
      publicUrl: 'https://files.test/new.pdf',
      generatedAt: new Date(),
    });
    repository.update.mockResolvedValue({
      ...invoice,
      pdfUrl: 'https://files.test/new.pdf',
    });
    await expect(
      service.generatePdf(baseInvoice.id, { forceRegenerate: true }),
    ).resolves.toMatchObject({ pdfUrl: 'https://files.test/new.pdf' });
    expect(pdfService.generate).toHaveBeenCalledTimes(1);
  });

  it('does not save PDF metadata after storage failure', async () => {
    repository.findById.mockResolvedValue(baseInvoice);
    pdfService.generate.mockRejectedValue(new Error('storage unavailable'));
    await expect(service.generatePdf(baseInvoice.id, {})).rejects.toThrow(
      'storage unavailable',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rejects reversed invoice-list date ranges', async () => {
    await expect(
      service.findAll({
        fromDate: '2026-10-09',
        toDate: '2026-10-01',
      } as Parameters<InvoiceService['findAll']>[0]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findManyAndCount).not.toHaveBeenCalled();
  });

  it('creates a DRAFT invoice linked to an existing project and customer', async () => {
    repository.create.mockResolvedValue(baseInvoice);

    const result = await service.create(
      {
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        dueDate: '2026-07-22',
        totalAmount: 1000,
      },
      baseInvoice.createdBy,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        customerId: customer.id,
        status: InvoiceStatus.DRAFT,
        createdBy: baseInvoice.createdBy,
      }),
    );
    expect(result).toMatchObject({
      totalAmount: 1000,
      paidAmount: 0,
      outstandingAmount: 1000,
      status: InvoiceStatus.DRAFT,
    });
  });

  it('rejects an unknown project', async () => {
    repository.findProjectWithCustomer.mockResolvedValue(null);

    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        totalAmount: 1000,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('rejects an unknown customer', async () => {
    repository.findCustomer.mockResolvedValue(null);

    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        totalAmount: 1000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a customer that differs from a linked quotation customer', async () => {
    repository.findProjectWithCustomer.mockResolvedValue({
      ...project,
      quotations: [
        {
          lead: {
            customer: { id: '00000000-0000-4000-8000-999999999999' },
          },
        },
      ],
    });

    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        totalAmount: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows multiple quotations belonging to the selected customer', async () => {
    repository.findProjectWithCustomer.mockResolvedValue({
      ...project,
      quotations: [
        {
          lead: {
            customer: { id: customer.id },
          },
        },
        {
          lead: {
            customer: { id: customer.id },
          },
        },
      ],
    });

    repository.create.mockResolvedValue(baseInvoice);

    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        totalAmount: 1000,
      }),
    ).resolves.toBeDefined();
  });

  it('returns paid and outstanding amounts on invoice detail', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      payments: [
        {
          id: 'payment-1',
          amount: 250.25,
          paymentDate: new Date('2026-06-23'),
        },
      ],
      paidAmount: new Prisma.Decimal(250.25),
      outstandingAmount: new Prisma.Decimal(749.75),
    });

    const result = await service.findOne(baseInvoice.id);

    expect(result.paidAmount).toBe(250.25);
    expect(result.outstandingAmount).toBe(749.75);
  });

  it('lists invoices using filters, sorting, and pagination', async () => {
    repository.findManyAndCount.mockResolvedValue([[baseInvoice], 11]);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      projectId: project.id,
      sortBy: InvoiceSortByDto.CREATED_AT,
      sortOrder: SortOrderDto.DESC,
    });

    expect(repository.findManyAndCount).toHaveBeenCalled();
    const [args] = repository.findManyAndCount.mock.calls[0] as [
      {
        skip: number;
        take: number;
        where: { projectId?: string };
        orderBy: { createdAt: 'desc' };
      },
    ];

    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where.projectId).toBe(project.id);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(result).toMatchObject({
      total: 11,
      page: 2,
      limit: 10,
      totalPages: 2,
    });
  });

  it('rejects invoice dates where dueDate is earlier', async () => {
    await expect(
      service.create({
        projectId: project.id,
        customerId: customer.id,
        invoiceDate: '2026-06-22',
        dueDate: '2026-06-21',
        totalAmount: 1000,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_INVOICE_DATES' },
    });
  });

  it('does not update an invoice that already has payments', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      payments: [
        { id: 'payment-1', amount: 100, paymentDate: new Date('2026-06-23') },
      ],
    });

    await expect(
      service.update(baseInvoice.id, { totalAmount: 900 }),
    ).rejects.toMatchObject({ response: { code: 'INVOICE_HAS_PAYMENTS' } });
  });

  it('updates an editable invoice', async () => {
    repository.findById.mockResolvedValue(baseInvoice);
    repository.update.mockResolvedValue({
      ...baseInvoice,
      totalAmount: new Prisma.Decimal(1200),
      status: InvoiceStatus.ISSUED,
    });

    const result = await service.update(
      baseInvoice.id,
      { totalAmount: 1200, status: EditableInvoiceStatusDto.ISSUED },
      'actor-2',
    );

    expect(repository.update).toHaveBeenCalledWith(
      baseInvoice.id,
      expect.objectContaining({
        totalAmount: 1200,
        status: InvoiceStatus.ISSUED,
        updatedBy: 'actor-2',
      }),
    );
    expect(result.status).toBe(InvoiceStatus.ISSUED);
  });

  it('generates an invoice number when an invoice is issued', async () => {
    repository.findById.mockResolvedValue(baseInvoice);
    repository.update.mockResolvedValue({
      ...baseInvoice,
      invoiceNumber: 'INV-202606-0001',
      status: InvoiceStatus.ISSUED,
    });

    const result = await service.update(
      baseInvoice.id,
      { status: EditableInvoiceStatusDto.ISSUED },
      'actor-2',
    );

    expect(repository.update).toHaveBeenCalledWith(
      baseInvoice.id,
      expect.objectContaining({
        invoiceNumber: 'INV-202606-0001',
      }),
    );
    expect(result.invoiceNumber).toBe('INV-202606-0001');
  });

  it('generates and stores invoice PDF metadata', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      invoiceNumber: 'INV-202606-0001',
      status: InvoiceStatus.ISSUED,
    });
    pdfService.generate.mockResolvedValue({
      filePath:
        'D:\\Projects\\ConstructPro\\backend\\storage\\invoices\\INV-202606-0001.pdf',
      publicUrl: 'http://localhost:4010/files/invoices/INV-202606-0001.pdf',
      generatedAt: new Date('2026-06-22T01:00:00.000Z'),
    });
    repository.update.mockResolvedValue({
      ...baseInvoice,
      invoiceNumber: 'INV-202606-0001',
      status: InvoiceStatus.ISSUED,
      pdfPath:
        'D:\\Projects\\ConstructPro\\backend\\storage\\invoices\\INV-202606-0001.pdf',
      pdfUrl: 'http://localhost:4010/files/invoices/INV-202606-0001.pdf',
      pdfGeneratedAt: new Date('2026-06-22T01:00:00.000Z'),
    });

    const result = await service.generatePdf(baseInvoice.id, {});

    expect(pdfService.generate).toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      baseInvoice.id,
      expect.objectContaining({
        invoiceNumber: 'INV-202606-0001',
        pdfUrl: 'http://localhost:4010/files/invoices/INV-202606-0001.pdf',
      }),
    );
    expect(result.pdfUrl).toBe(
      'http://localhost:4010/files/invoices/INV-202606-0001.pdf',
    );
  });

  it('cancels an active invoice and records the actor', async () => {
    repository.findById.mockResolvedValue(baseInvoice);
    repository.update.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.CANCELLED,
    });

    const result = await service.cancel(baseInvoice.id, 'actor-1');

    expect(repository.update).toHaveBeenCalledWith(baseInvoice.id, {
      status: InvoiceStatus.CANCELLED,
      updatedBy: 'actor-1',
    });
    expect(result.status).toBe(InvoiceStatus.CANCELLED);
  });

  it('does not cancel a paid invoice', async () => {
    repository.findById.mockResolvedValue({
      ...baseInvoice,
      status: InvoiceStatus.PAID,
    });

    await expect(service.cancel(baseInvoice.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
