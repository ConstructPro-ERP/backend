import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { InvoiceService } from './invoice.service';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceSortByDto, SortOrderDto } from './dto/list-invoices-query.dto';

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
  quotation: null,
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
      pdfService,
    );
    repository.findProjectWithCustomer.mockResolvedValue(project);
    repository.findCustomer.mockResolvedValue(customer);
    repository.countByInvoiceNumberPrefix.mockResolvedValue(0);
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

  it('rejects a customer that differs from the converted quotation customer', async () => {
    repository.findProjectWithCustomer.mockResolvedValue({
      ...project,
      quotation: {
        lead: {
          customer: { id: '00000000-0000-4000-8000-999999999999' },
        },
      },
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

    expect(repository.findManyAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ projectId: project.id }),
        orderBy: { createdAt: 'desc' },
      }),
    );
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
      { totalAmount: 1200, status: InvoiceStatus.ISSUED },
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
      { status: InvoiceStatus.ISSUED },
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
