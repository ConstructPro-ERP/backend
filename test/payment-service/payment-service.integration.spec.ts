import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, {
  type Response as SupertestResponse,
  type Test as SupertestTest,
} from 'supertest';
import {
  InvoicePaymentController,
  PaymentController,
} from '../../apps/payment-service/src/payment.controller';
import { PaymentService } from '../../apps/payment-service/src/payment.service';

type RequestTarget = Parameters<typeof request>[0];
type CreatePaymentBody = {
  payment: { id: string };
  invoice: { id?: string; outstandingAmount?: number };
  code?: string;
};
type PaymentBody = { id: string };
type HistoryBody = {
  invoice: { id: string };
  payments: Array<{ id: string }>;
};

function serverOf(app: INestApplication): RequestTarget {
  return app.getHttpServer() as RequestTarget;
}

async function expectResponse(
  test: SupertestTest,
  status: number,
): Promise<SupertestResponse> {
  return test.expect(status);
}

function responseBody<T>(response: SupertestResponse): T {
  return response.body as T;
}

describe('Payment Service routes - integration', () => {
  let app: INestApplication;

  const paymentService = {
    create: jest.fn(),
    findOne: jest.fn(),
    history: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController, InvoicePaymentController],
      providers: [{ provide: PaymentService, useValue: paymentService }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /payments records a payment', async () => {
    paymentService.create.mockResolvedValue({
      payment: { id: 'pay-1', amount: 250 },
      invoice: { id: 'inv-1', outstandingAmount: 750 },
    });

    const response = await expectResponse(
      request(serverOf(app))
        .post('/payments')
        .set('x-user-id', 'actor-1')
        .send({
          invoiceId: '00000000-0000-4000-8000-000000000001',
          referenceNumber: 'PAY-2026-0001',
          paymentDate: '2026-06-22T00:00:00.000Z',
          amount: 250,
          paymentMethod: 'BANK_TRANSFER',
        }),
      201,
    );
    const body = responseBody<CreatePaymentBody>(response);

    expect(body.payment.id).toBe('pay-1');
    expect(paymentService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: '00000000-0000-4000-8000-000000000001',
        amount: 250,
      }),
      'actor-1',
    );
  });

  it('GET /payments/:id returns payment details', async () => {
    paymentService.findOne.mockResolvedValue({ id: 'pay-1' });

    const response = await expectResponse(
      request(serverOf(app)).get(
        '/payments/00000000-0000-4000-8000-000000000003',
      ),
      200,
    );
    const body = responseBody<PaymentBody>(response);

    expect(body.id).toBe('pay-1');
  });

  it('GET /invoices/:invoiceId/payments returns payment history', async () => {
    paymentService.history.mockResolvedValue({
      invoice: { id: 'inv-1', outstandingAmount: 750 },
      payments: [{ id: 'pay-1', amount: 250 }],
    });

    const response = await expectResponse(
      request(serverOf(app)).get(
        '/invoices/00000000-0000-4000-8000-000000000001/payments',
      ),
      200,
    );
    const body = responseBody<HistoryBody>(response);

    expect(body.invoice.id).toBe('inv-1');
    expect(body.payments).toHaveLength(1);
  });

  it('rejects invalid payment payloads before hitting the service', async () => {
    await expectResponse(
      request(serverOf(app)).post('/payments').send({
        invoiceId: 'not-a-uuid',
        referenceNumber: '',
        paymentDate: '2026-06-22T00:00:00.000Z',
        amount: 250,
        paymentMethod: 'BANK_TRANSFER',
      }),
      400,
    );

    expect(paymentService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid UUID params before hitting the service', async () => {
    await expectResponse(
      request(serverOf(app)).get('/payments/not-a-uuid'),
      400,
    );

    expect(paymentService.findOne).not.toHaveBeenCalled();
  });

  it('surfaces service-level conflicts as HTTP 409 responses', async () => {
    paymentService.create.mockRejectedValue(
      new ConflictException({
        code: 'PAYMENT_REFERENCE_EXISTS',
        message: 'A payment with this reference number already exists.',
      }),
    );

    const response = await expectResponse(
      request(serverOf(app)).post('/payments').send({
        invoiceId: '00000000-0000-4000-8000-000000000001',
        referenceNumber: 'PAY-2026-0001',
        paymentDate: '2026-06-22T00:00:00.000Z',
        amount: 250,
        paymentMethod: 'BANK_TRANSFER',
      }),
      409,
    );
    const body = responseBody<CreatePaymentBody>(response);

    expect(body.code).toBe('PAYMENT_REFERENCE_EXISTS');
  });
});
