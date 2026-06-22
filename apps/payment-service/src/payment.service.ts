import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PaymentRepository,
  PaymentTransaction,
  PaymentWithCustomer,
} from './repositories/payment.repository';

const PAYABLE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
]);

@Injectable()
export class PaymentService {
  constructor(private readonly payments: PaymentRepository) {}

  async create(dto: CreatePaymentDto, actorId?: string) {
    const referenceNumber = dto.referenceNumber.trim();
    if (!referenceNumber) {
      throw new BadRequestException({
        code: 'PAYMENT_REFERENCE_REQUIRED',
        message: 'Payment reference number is required.',
      });
    }

    return this.withTransactionRetry((tx) =>
      this.recordPayment(tx, dto, referenceNumber, actorId),
    );
  }

  async findOne(id: string) {
    const payment = await this.payments.findPayment(id);
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment not found.',
      });
    }
    return this.toPaymentResponse(payment);
  }

  async history(invoiceId: string) {
    const invoice = await this.payments.findInvoiceSummary(invoiceId);
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }
    const payments = await this.payments.findHistory(invoiceId);

    return {
      invoice: this.toInvoiceSummary(invoice),
      payments: payments.map((payment) => this.toPaymentResponse(payment)),
    };
  }

  private async recordPayment(
    tx: PaymentTransaction,
    dto: CreatePaymentDto,
    referenceNumber: string,
    actorId?: string,
  ) {
    await this.payments.lockInvoice(tx, dto.invoiceId);
    const invoice = await this.payments.findInvoice(tx, dto.invoiceId);
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException({
        code: 'CANCELLED_INVOICE_PAYMENT_REJECTED',
        message: 'Payments cannot be recorded for a cancelled invoice.',
      });
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException({
        code: 'INVOICE_ALREADY_PAID',
        message: 'This invoice is already fully paid.',
      });
    }
    if (!PAYABLE_STATUSES.has(invoice.status)) {
      throw new ConflictException({
        code: 'INVOICE_NOT_ISSUED',
        message: 'Only issued or overdue invoices can receive payments.',
      });
    }

    if (await this.payments.findByReference(tx, referenceNumber)) {
      throw new ConflictException({
        code: 'PAYMENT_REFERENCE_EXISTS',
        message: 'A payment with this reference number already exists.',
      });
    }

    const aggregate = await this.payments.sumPayments(tx, dto.invoiceId);
    const paidBefore = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const totalAmount = new Prisma.Decimal(invoice.totalAmount);
    const outstandingBefore = totalAmount.minus(paidBefore);
    const amount = new Prisma.Decimal(dto.amount);

    if (amount.lte(0)) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_AMOUNT_INVALID',
        message: 'Payment amount must be greater than zero.',
      });
    }
    if (outstandingBefore.lte(0)) {
      throw new ConflictException({
        code: 'INVOICE_ALREADY_PAID',
        message: 'This invoice has no outstanding balance.',
      });
    }
    if (amount.gt(outstandingBefore)) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_EXCEEDS_OUTSTANDING',
        message: 'Payment amount cannot exceed the outstanding balance.',
        outstandingAmount: money(outstandingBefore),
      });
    }

    const paidAmount = paidBefore.plus(amount);
    const outstandingAmount = totalAmount.minus(paidAmount);
    const status = outstandingAmount.eq(0)
      ? InvoiceStatus.PAID
      : InvoiceStatus.PARTIALLY_PAID;

    const payment = await this.payments.create(tx, {
      invoiceId: dto.invoiceId,
      customerId: invoice.customerId,
      referenceNumber,
      paymentDate: new Date(dto.paymentDate),
      amount,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
      createdBy: actorId,
    });
    const updatedInvoice = await this.payments.updateInvoice(tx, invoice.id, {
      paidAmount,
      outstandingAmount,
      status,
      updatedBy: actorId,
    });

    return {
      payment: this.toPaymentResponse(payment),
      invoice: this.toInvoiceSummary(updatedInvoice),
    };
  }

  private async withTransactionRetry<T>(
    work: (tx: PaymentTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.payments.transaction(work);
      } catch (error: unknown) {
        if (isPrismaError(error, 'P2002')) {
          throw new ConflictException({
            code: 'PAYMENT_REFERENCE_EXISTS',
            message: 'A payment with this reference number already exists.',
          });
        }
        if (isPrismaError(error, 'P2034')) {
          if (attempt < 3) continue;
          throw new ConflictException({
            code: 'PAYMENT_CONCURRENCY_CONFLICT',
            message:
              'The invoice changed while recording the payment. Try again.',
          });
        }
        throw error;
      }
    }
    throw new ConflictException({
      code: 'PAYMENT_CONCURRENCY_CONFLICT',
      message: 'The invoice changed while recording the payment. Try again.',
    });
  }

  private toPaymentResponse(payment: PaymentWithCustomer) {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      customerId: payment.customerId,
      referenceNumber: payment.referenceNumber,
      paymentDate: payment.paymentDate,
      amount: money(payment.amount),
      paymentMethod: payment.paymentMethod,
      notes: payment.notes,
      createdBy: payment.createdBy,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      customer: payment.customer,
    };
  }

  private toInvoiceSummary(invoice: {
    id: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    outstandingAmount: Prisma.Decimal;
    status: InvoiceStatus;
  }) {
    return {
      id: invoice.id,
      totalAmount: money(invoice.totalAmount),
      paidAmount: money(invoice.paidAmount),
      outstandingAmount: money(invoice.outstandingAmount),
      status: invoice.status,
    };
  }
}

function money(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 100) / 100;
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
