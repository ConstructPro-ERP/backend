import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import {
  CreatePaymentDto,
  PaymentMethodDto,
} from '../../apps/payment-service/src/dto/create-payment.dto';
import { PaymentService } from '../../apps/payment-service/src/payment.service';
import {
  PaymentRepository,
  PaymentTransaction,
} from '../../apps/payment-service/src/repositories/payment.repository';

const tx = {} as PaymentTransaction;
const repository = {
  transaction: jest.fn(),
  lockInvoice: jest.fn(),
  findInvoice: jest.fn(),
  sumPayments: jest.fn(),
  findByReference: jest.fn(),
  create: jest.fn(),
  updateInvoice: jest.fn(),
  findPayment: jest.fn(),
  findInvoiceSummary: jest.fn(),
  findHistory: jest.fn(),
};

const invoice = {
  id: '00000000-0000-4000-8000-000000000001',
  customerId: '00000000-0000-4000-8000-000000000002',
  totalAmount: new Prisma.Decimal(1000),
  paidAmount: new Prisma.Decimal(0),
  outstandingAmount: new Prisma.Decimal(1000),
  status: InvoiceStatus.ISSUED,
};

const dto: CreatePaymentDto = {
  invoiceId: invoice.id,
  referenceNumber: 'PAY-2026-0001',
  paymentDate: '2026-06-22',
  amount: 250,
  paymentMethod: PaymentMethodDto.BANK_TRANSFER,
  notes: 'Progress payment',
};

const payment = {
  id: '00000000-0000-4000-8000-000000000003',
  invoiceId: invoice.id,
  customerId: invoice.customerId,
  referenceNumber: dto.referenceNumber,
  paymentDate: new Date('2026-06-22T00:00:00.000Z'),
  amount: new Prisma.Decimal(250),
  paymentMethod: PaymentMethod.BANK_TRANSFER,
  notes: dto.notes ?? null,
  createdBy: 'actor-1',
  createdAt: new Date('2026-06-22T00:00:00.000Z'),
  updatedAt: new Date('2026-06-22T00:00:00.000Z'),
  customer: { id: invoice.customerId, fullName: 'Acme Construction' },
};

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentService(repository as unknown as PaymentRepository);
    repository.transaction.mockImplementation(
      (work: (transaction: PaymentTransaction) => Promise<unknown>) => work(tx),
    );
    repository.lockInvoice.mockResolvedValue([{ id: invoice.id }]);
    repository.findInvoice.mockResolvedValue(invoice);
    repository.findByReference.mockResolvedValue(null);
    repository.sumPayments.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(0) },
    });
    repository.create.mockResolvedValue(payment);
    repository.updateInvoice.mockResolvedValue({
      ...invoice,
      paidAmount: new Prisma.Decimal(250),
      outstandingAmount: new Prisma.Decimal(750),
      status: InvoiceStatus.PARTIALLY_PAID,
    });
  });

  it('records a partial payment and updates invoice balances atomically', async () => {
    const result = await service.create(dto, 'actor-1');

    expect(repository.lockInvoice).toHaveBeenCalledWith(tx, invoice.id);
    expect(repository.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        referenceNumber: dto.referenceNumber,
        amount: new Prisma.Decimal(250),
        createdBy: 'actor-1',
      }),
    );
    expect(repository.updateInvoice).toHaveBeenCalledWith(tx, invoice.id, {
      paidAmount: new Prisma.Decimal(250),
      outstandingAmount: new Prisma.Decimal(750),
      status: InvoiceStatus.PARTIALLY_PAID,
      updatedBy: 'actor-1',
    });
    expect(result.invoice).toMatchObject({
      paidAmount: 250,
      outstandingAmount: 750,
      status: InvoiceStatus.PARTIALLY_PAID,
    });
  });

  it('marks the invoice PAID when the payment clears the balance', async () => {
    repository.sumPayments.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(250) },
    });
    repository.create.mockResolvedValue({
      ...payment,
      amount: new Prisma.Decimal(750),
    });
    repository.updateInvoice.mockResolvedValue({
      ...invoice,
      paidAmount: new Prisma.Decimal(1000),
      outstandingAmount: new Prisma.Decimal(0),
      status: InvoiceStatus.PAID,
    });

    const result = await service.create({ ...dto, amount: 750 });

    expect(repository.updateInvoice).toHaveBeenCalledWith(
      tx,
      invoice.id,
      expect.objectContaining({
        paidAmount: new Prisma.Decimal(1000),
        outstandingAmount: new Prisma.Decimal(0),
        status: InvoiceStatus.PAID,
      }),
    );
    expect(result.invoice.status).toBe(InvoiceStatus.PAID);
  });

  it('rejects a payment greater than the outstanding balance', async () => {
    await expect(
      service.create({ ...dto, amount: 1000.01 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateInvoice).not.toHaveBeenCalled();
  });

  it.each([0, -5])('rejects a non-positive amount: %s', async (amount) => {
    await expect(service.create({ ...dto, amount })).rejects.toMatchObject({
      response: { code: 'PAYMENT_AMOUNT_INVALID' },
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects payments for a cancelled invoice', async () => {
    repository.findInvoice.mockResolvedValue({
      ...invoice,
      status: InvoiceStatus.CANCELLED,
    });

    await expect(service.create(dto)).rejects.toMatchObject({
      response: { code: 'CANCELLED_INVOICE_PAYMENT_REJECTED' },
    });
  });

  it('rejects payments for an already paid invoice', async () => {
    repository.findInvoice.mockResolvedValue({
      ...invoice,
      status: InvoiceStatus.PAID,
    });

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects payments for a draft invoice', async () => {
    repository.findInvoice.mockResolvedValue({
      ...invoice,
      status: InvoiceStatus.DRAFT,
    });

    await expect(service.create(dto)).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_ISSUED' },
    });
  });

  it('rejects duplicate payment reference numbers', async () => {
    repository.findByReference.mockResolvedValue(payment);

    await expect(service.create(dto)).rejects.toMatchObject({
      response: { code: 'PAYMENT_REFERENCE_EXISTS' },
    });
  });

  it('rejects an unknown invoice', async () => {
    repository.findInvoice.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns complete payment history and current invoice balances', async () => {
    repository.findInvoiceSummary.mockResolvedValue({
      ...invoice,
      paidAmount: new Prisma.Decimal(250),
      outstandingAmount: new Prisma.Decimal(750),
      status: InvoiceStatus.PARTIALLY_PAID,
      customer: payment.customer,
    });
    repository.findHistory.mockResolvedValue([payment]);

    const result = await service.history(invoice.id);

    expect(result.invoice).toMatchObject({
      paidAmount: 250,
      outstandingAmount: 750,
    });
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].amount).toBe(250);
  });
});
