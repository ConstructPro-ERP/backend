import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GenerateInvoicePdfDto } from './dto/generate-invoice-pdf.dto';
import { EditableInvoiceStatusDto } from './dto/invoice-status.dto';
import {
  InvoiceSortByDto,
  ListInvoicesQueryDto,
} from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import {
  InvoiceRepository,
  InvoiceWithDetails,
} from './repositories/invoice.repository';

const EDITABLE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
]);

@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  async create(dto: CreateInvoiceDto, actorId?: string) {
    await this.validateProjectCustomer(dto.projectId, dto.customerId);
    this.validateDates(dto.invoiceDate, dto.dueDate);

    const invoice = await this.invoices.create({
      projectId: dto.projectId,
      customerId: dto.customerId,
      invoiceNumber:
        dto.status === EditableInvoiceStatusDto.ISSUED
          ? await this.generateInvoiceNumber(new Date(dto.invoiceDate))
          : undefined,
      invoiceDate: new Date(dto.invoiceDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      totalAmount: dto.totalAmount,
      paidAmount: 0,
      outstandingAmount: dto.totalAmount,
      notes: dto.notes,
      status: dto.status ?? InvoiceStatus.DRAFT,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return this.toResponse(invoice);
  }

  createForProject(
    projectId: string,
    dto: Omit<CreateInvoiceDto, 'projectId'>,
    actorId?: string,
  ) {
    return this.create({ ...dto, projectId }, actorId);
  }

  async findAll(query: ListInvoicesQueryDto) {
    this.validateDateRange(query.fromDate, query.toDate);

    const where: Prisma.InvoiceWhereInput = {
      projectId: query.projectId,
      customerId: query.customerId,
      status: query.status,
      invoiceDate:
        query.fromDate || query.toDate
          ? {
              gte: query.fromDate ? new Date(query.fromDate) : undefined,
              lte: query.toDate ? endOfRequestedDay(query.toDate) : undefined,
            }
          : undefined,
    };

    const page = query.page;
    const limit = query.limit;
    const [items, total] = await this.invoices.findManyAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [query.sortBy ?? InvoiceSortByDto.CREATED_AT]: query.sortOrder,
      },
    });

    return {
      items: items.map((invoice) => this.toResponse(invoice)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    return this.toResponse(await this.requireInvoice(id));
  }

  async update(id: string, dto: UpdateInvoiceDto, actorId?: string) {
    const invoice = await this.requireInvoice(id);
    this.assertEditable(invoice);

    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'INVOICE_UPDATE_EMPTY',
        message: 'At least one invoice field must be provided.',
      });
    }

    const projectId = dto.projectId ?? invoice.projectId;
    const customerId = dto.customerId ?? invoice.customerId;
    if (dto.projectId || dto.customerId) {
      await this.validateProjectCustomer(projectId, customerId);
    }

    const invoiceDate = dto.invoiceDate
      ? new Date(dto.invoiceDate)
      : invoice.invoiceDate;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate;
    this.validateDates(invoiceDate.toISOString(), dueDate?.toISOString());

    const nextStatus = dto.status ?? invoice.status;
    const invoiceNumber =
      !invoice.invoiceNumber && nextStatus === InvoiceStatus.ISSUED
        ? await this.generateInvoiceNumber(invoiceDate)
        : undefined;

    const updated = await this.invoices.update(id, {
      projectId: dto.projectId,
      customerId: dto.customerId,
      invoiceNumber,
      invoiceDate: dto.invoiceDate ? invoiceDate : undefined,
      dueDate: dto.dueDate ? (dueDate ?? undefined) : undefined,
      totalAmount: dto.totalAmount,
      outstandingAmount: dto.totalAmount,
      notes: dto.notes,
      status: dto.status,
      updatedBy: actorId,
    });

    return this.toResponse(updated);
  }

  async cancel(id: string, actorId?: string) {
    const invoice = await this.requireInvoice(id);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      return this.toResponse(invoice);
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException({
        code: 'PAID_INVOICE_CANNOT_BE_CANCELLED',
        message: 'A paid invoice cannot be cancelled.',
      });
    }

    const cancelled = await this.invoices.update(id, {
      status: InvoiceStatus.CANCELLED,
      updatedBy: actorId,
    });
    return this.toResponse(cancelled);
  }

  async generatePdf(id: string, dto: GenerateInvoicePdfDto, actorId?: string) {
    const invoice = await this.requireInvoice(id);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_INVOICE_PDF_BLOCKED',
        message: 'Cancelled invoices cannot generate PDF documents.',
      });
    }

    if (invoice.pdfUrl && !dto.forceRegenerate) {
      return this.toResponse(invoice);
    }

    const invoiceNumber =
      invoice.invoiceNumber ??
      (await this.generateInvoiceNumber(invoice.invoiceDate));

    const pdf = await this.invoicePdfService.generate({
      invoiceId: invoice.id,
      invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      customerName: invoice.customer.fullName,
      customerId: invoice.customer.id,
      projectName: invoice.project.projectName,
      projectId: invoice.project.id,
      totalAmount: money(invoice.totalAmount),
      paidAmount: money(invoice.paidAmount),
      outstandingAmount: money(invoice.outstandingAmount),
      notes: invoice.notes,
    });

    const updated = await this.invoices.update(id, {
      invoiceNumber,
      pdfPath: pdf.filePath,
      pdfUrl: pdf.publicUrl,
      pdfGeneratedAt: pdf.generatedAt,
      updatedBy: actorId,
    });

    return this.toResponse(updated);
  }

  private async requireInvoice(id: string): Promise<InvoiceWithDetails> {
    const invoice = await this.invoices.findById(id);
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }
    return invoice;
  }

  private assertEditable(invoice: InvoiceWithDetails) {
    if (!EDITABLE_STATUSES.has(invoice.status)) {
      throw new ConflictException({
        code: 'INVOICE_NOT_EDITABLE',
        message: `Invoices with status ${invoice.status} cannot be edited.`,
      });
    }
    if (invoice.payments.length > 0) {
      throw new ConflictException({
        code: 'INVOICE_HAS_PAYMENTS',
        message: 'An invoice with recorded payments cannot be edited.',
      });
    }
  }

  private async validateProjectCustomer(projectId: string, customerId: string) {
    const [project, customer] = await Promise.all([
      this.invoices.findProjectWithCustomer(projectId),
      this.invoices.findCustomer(customerId),
    ]);

    if (!project) {
      throw new NotFoundException({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found.',
      });
    }
    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found.',
      });
    }

    const convertedCustomerId = project.quotation?.lead.customer?.id;
    if (convertedCustomerId && convertedCustomerId !== customerId) {
      throw new BadRequestException({
        code: 'PROJECT_CUSTOMER_MISMATCH',
        message: 'The selected customer does not own this project.',
      });
    }
  }

  private validateDates(invoiceDate: string, dueDate?: string) {
    if (dueDate && new Date(dueDate) < new Date(invoiceDate)) {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_DATES',
        message: 'The due date cannot be before the invoice date.',
      });
    }
  }

  private validateDateRange(fromDate?: string, toDate?: string) {
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'toDate cannot be before fromDate.',
      });
    }
  }

  private async generateInvoiceNumber(invoiceDate: Date): Promise<string> {
    const year = invoiceDate.getUTCFullYear();
    const month = String(invoiceDate.getUTCMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const count = await this.invoices.countByInvoiceNumberPrefix(prefix);
      const sequence = String(count + attempt + 1).padStart(4, '0');
      return `${prefix}-${sequence}`;
    }

    throw new ConflictException({
      code: 'INVOICE_NUMBER_GENERATION_FAILED',
      message: 'Unable to generate a unique invoice number.',
    });
  }

  private toResponse(invoice: InvoiceWithDetails) {
    const totalAmount = money(invoice.totalAmount);
    const paidAmount = money(invoice.paidAmount);

    return {
      id: invoice.id,
      projectId: invoice.projectId,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      totalAmount,
      paidAmount,
      outstandingAmount: money(invoice.outstandingAmount),
      pdfPath: invoice.pdfPath,
      pdfUrl: invoice.pdfUrl,
      pdfGeneratedAt: invoice.pdfGeneratedAt,
      notes: invoice.notes,
      status: invoice.status,
      createdBy: invoice.createdBy,
      updatedBy: invoice.updatedBy,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      project: invoice.project,
      customer: invoice.customer,
      payments: invoice.payments.map((payment) => ({
        ...payment,
        amount: money(payment.amount),
      })),
    };
  }
}

function money(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 100) / 100;
}

function endOfRequestedDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value);
  return new Date(`${value}T23:59:59.999Z`);
}
