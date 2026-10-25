import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import {
  PaymentRepository,
  PaymentTransaction,
} from '../../apps/payment-service/src/repositories/payment.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, objectContaining } from '../support/prisma.mock';

describe('PaymentRepository', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let repository: PaymentRepository;
  beforeEach(() => {
    prisma = createPrismaMock();
    repository = new PaymentRepository(prisma as unknown as PrismaService);
  });

  it('runs payment work at Serializable isolation and passes the transaction result through', async () => {
    const work = jest
      .fn<Promise<string>, [unknown]>()
      .mockResolvedValue('recorded');
    prisma.$transaction.mockImplementation((callback: typeof work) =>
      callback(prisma),
    );
    await expect(repository.transaction(work)).resolves.toBe('recorded');
    expect(prisma.$transaction).toHaveBeenCalledWith(work, {
      isolationLevel: 'Serializable',
    });
    expect(work).toHaveBeenCalledWith(prisma);
  });

  it('locks and reads the invoice and sums existing payments on the supplied transaction', async () => {
    const tx = prisma as unknown as PaymentTransaction;
    await repository.lockInvoice(tx, 'i1');
    const [sql, id] = prisma.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(sql.join('?')).toContain('FOR UPDATE');
    expect(id).toBe('i1');
    await repository.findInvoice(tx, 'i1');
    await repository.sumPayments(tx, 'i1');
    await repository.findByReference(tx, 'REF-1');
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'i1' },
        select: objectContaining({ totalAmount: true, status: true }),
      }),
    );
    expect(prisma.payment.aggregate).toHaveBeenCalledWith({
      where: { invoiceId: 'i1' },
      _sum: { amount: true },
    });
    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: { referenceNumber: 'REF-1' },
    });
  });

  it('writes the payment and balance update on the same transaction', async () => {
    const tx = prisma as unknown as PaymentTransaction;
    const data = {
      invoiceId: 'i1',
      customerId: 'c1',
      referenceNumber: 'REF-1',
      paymentDate: new Date('2026-10-01'),
      amount: new Prisma.Decimal('12.34'),
      paymentMethod: PaymentMethod.CASH,
    };
    await repository.create(tx, data);
    expect(prisma.payment.create).toHaveBeenCalledWith(
      objectContaining({
        data,
        include: objectContaining({ customer: expect.any(Object) as unknown }),
      }),
    );
    const balances = {
      paidAmount: data.amount,
      outstandingAmount: new Prisma.Decimal(0),
      status: InvoiceStatus.PAID,
    };
    await repository.updateInvoice(tx, 'i1', balances);
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: balances,
    });
  });

  it('returns joined payment details and invoice-scoped history in payment-date order', async () => {
    await repository.findPayment('pay1');
    expect(prisma.payment.findUnique).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'pay1' },
        include: expect.any(Object) as unknown,
      }),
    );
    await repository.findInvoiceSummary('i1');
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'i1' },
        select: objectContaining({
          paidAmount: true,
          outstandingAmount: true,
        }),
      }),
    );
    await repository.findHistory('i1');
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: { invoiceId: 'i1' },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  });
});
