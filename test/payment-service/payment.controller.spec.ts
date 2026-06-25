import {
  InvoicePaymentController,
  PaymentController,
} from '../../apps/payment-service/src/payment.controller';
import { PaymentService } from '../../apps/payment-service/src/payment.service';

describe('Payment controllers', () => {
  const paymentService = {
    create: jest.fn(),
    findOne: jest.fn(),
    history: jest.fn(),
  };

  let paymentController: PaymentController;
  let invoicePaymentController: InvoicePaymentController;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentController = new PaymentController(
      paymentService as unknown as PaymentService,
    );
    invoicePaymentController = new InvoicePaymentController(
      paymentService as unknown as PaymentService,
    );
  });

  it('delegates payment creation', async () => {
    const dto = {
      invoiceId: '00000000-0000-4000-8000-000000000001',
      referenceNumber: 'PAY-2026-0001',
      paymentDate: '2026-06-22',
      amount: 250,
      paymentMethod: 'BANK_TRANSFER',
    };
    const response = { payment: { id: 'pay-1' }, invoice: { id: 'inv-1' } };
    paymentService.create.mockResolvedValue(response);

    await expect(paymentController.create(dto, 'actor-1')).resolves.toBe(
      response,
    );
    expect(paymentService.create).toHaveBeenCalledWith(dto, 'actor-1');
  });

  it('delegates payment lookup', async () => {
    const response = { id: 'pay-1' };
    paymentService.findOne.mockResolvedValue(response);

    await expect(
      paymentController.findOne('00000000-0000-4000-8000-000000000003'),
    ).resolves.toBe(response);
    expect(paymentService.findOne).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
    );
  });

  it('delegates invoice payment history lookups', async () => {
    const response = { invoice: { id: 'inv-1' }, payments: [] };
    paymentService.history.mockResolvedValue(response);

    await expect(
      invoicePaymentController.history('00000000-0000-4000-8000-000000000001'),
    ).resolves.toBe(response);
    expect(paymentService.history).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
  });
});
