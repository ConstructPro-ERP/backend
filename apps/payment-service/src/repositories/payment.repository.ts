import { Injectable } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const paymentInclude = Prisma.validator<Prisma.PaymentInclude>()({
  customer: { select: { id: true, fullName: true } },
});

export type PaymentWithCustomer = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

export type PaymentTransaction = Prisma.TransactionClient;

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  lockInvoice(tx: PaymentTransaction, invoiceId: string) {
    return tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE
    `;
  }

  findInvoice(tx: PaymentTransaction, invoiceId: string) {
    return tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        paidAmount: true,
        outstandingAmount: true,
        status: true,
      },
    });
  }

  sumPayments(tx: PaymentTransaction, invoiceId: string) {
    return tx.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
  }

  findByReference(tx: PaymentTransaction, referenceNumber: string) {
    return tx.payment.findUnique({ where: { referenceNumber } });
  }

  create(
    tx: PaymentTransaction,
    data: {
      invoiceId: string;
      customerId: string;
      referenceNumber: string;
      paymentDate: Date;
      amount: Prisma.Decimal;
      paymentMethod: PaymentMethod;
      notes?: string;
      createdBy?: string;
    },
  ) {
    return tx.payment.create({ data, include: paymentInclude });
  }

  updateInvoice(
    tx: PaymentTransaction,
    invoiceId: string,
    data: {
      paidAmount: Prisma.Decimal;
      outstandingAmount: Prisma.Decimal;
      status: InvoiceStatus;
      updatedBy?: string;
    },
  ) {
    return tx.invoice.update({ where: { id: invoiceId }, data });
  }

  findPayment(id: string) {
    return this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });
  }

  findInvoiceSummary(invoiceId: string) {
    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        totalAmount: true,
        paidAmount: true,
        outstandingAmount: true,
        status: true,
        customer: { select: { id: true, fullName: true } },
      },
    });
  }

  findHistory(invoiceId: string) {
    return this.prisma.payment.findMany({
      where: { invoiceId },
      include: paymentInclude,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
