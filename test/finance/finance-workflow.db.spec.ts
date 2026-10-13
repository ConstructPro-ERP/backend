import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { InvoiceStatus, Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import {
  InvoiceController,
  ProjectInvoiceController,
  FinanceReportsController,
} from '../../apps/invoice-service/src/invoice.controller';
import { InvoiceService } from '../../apps/invoice-service/src/invoice.service';
import { InvoiceRepository } from '../../apps/invoice-service/src/repositories/invoice.repository';
import { InvoicePdfService } from '../../apps/invoice-service/src/pdf/invoice-pdf.service';
import { FinanceSummaryService } from '../../apps/invoice-service/src/finance-summary.service';
import { FinanceSummaryRepository } from '../../apps/invoice-service/src/repositories/finance-summary.repository';
import {
  PaymentController,
  InvoicePaymentController,
} from '../../apps/payment-service/src/payment.controller';
import { PaymentService } from '../../apps/payment-service/src/payment.service';
import { PaymentRepository } from '../../apps/payment-service/src/repositories/payment.repository';
import { AnalyticsController } from '../../apps/analytics-service/src/analytics.controller';
import { AnalyticsService } from '../../apps/analytics-service/src/analytics.service';
import { AnalyticsRepository } from '../../apps/analytics-service/src/repositories/analytics.repository';
import { AiForecastingController } from '../../apps/ai-service/src/ai-forecasting.controller';
import { AiForecastingService } from '../../apps/ai-service/src/ai-forecasting.service';
import { AiPromptService } from '../../apps/ai-service/src/ai-prompt.service';
import { AiProviderService } from '../../apps/ai-service/src/ai-provider.service';
import { AiRepository } from '../../apps/ai-service/src/repositories/ai.repository';

type InvoiceBody = {
  id: string;
  status: string;
  invoiceNumber: string | null;
  paidAmount: number;
  outstandingAmount: number;
};
type DashboardBody = {
  revenue: {
    totalRevenue: number;
    paidAmount: number;
    outstandingBalance: number;
  };
  projects: { totalProjects: number };
};
type PredictionBody = {
  projectId: string;
  sufficientData: boolean;
  predictionSource: string;
  explanation: string;
};

// No business service/repository is mocked. Only the paid provider is replaced.
// The dedicated config fails if DATABASE_URL_TEST is absent; never use the app DB.
describe('Persisted invoice -> payment -> dashboard -> AI workflows', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invoice: InvoiceBody;
  const customerId = randomUUID();
  const projectId = randomUUID();
  const userId = randomUUID();
  const invoiceDate = new Date(Date.now() + 86400000).toISOString();
  const provider = { predictViaProvider: jest.fn().mockResolvedValue(null) };
  function server() {
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
  function payment(amount: number, referenceNumber = randomUUID()) {
    return request(server()).post('/payments').send({
      invoiceId: invoice.id,
      amount,
      referenceNumber,
      paymentDate: invoiceDate,
      paymentMethod: 'BANK_TRANSFER',
    });
  }
  async function issue() {
    await request(server())
      .patch(`/invoices/${invoice.id}`)
      .send({ status: 'ISSUED' })
      .expect(200);
  }
  async function persisted() {
    return prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        InvoiceController,
        ProjectInvoiceController,
        FinanceReportsController,
        PaymentController,
        InvoicePaymentController,
        AnalyticsController,
        AiForecastingController,
      ],
      providers: [
        PrismaService,
        InvoiceService,
        InvoiceRepository,
        InvoicePdfService,
        FinanceSummaryService,
        FinanceSummaryRepository,
        PaymentService,
        PaymentRepository,
        AnalyticsService,
        AnalyticsRepository,
        AiForecastingService,
        AiPromptService,
        AiRepository,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: AiProviderService, useValue: provider },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = module.get(PrismaService);
    await prisma.user.create({
      data: {
        id: userId,
        fullName: 'Finance Test Manager',
        email: `finance-test-${userId}@example.test`,
      },
    });
    await prisma.customer.create({
      data: { id: customerId, fullName: `Finance Test ${customerId}` },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        projectName: `Finance Test ${projectId}`,
        projectManagerId: userId,
        startDate: new Date(invoiceDate),
        createdAt: new Date(invoiceDate),
      },
    });
  });

  beforeEach(async () => {
    provider.predictViaProvider.mockReset().mockResolvedValue(null);
    const response = await request(server())
      .post('/invoices')
      .set('x-user-id', userId)
      .send({ projectId, customerId, invoiceDate, totalAmount: 1000.25 })
      .expect(201);
    invoice = response.body as InvoiceBody;
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.payment.deleteMany({ where: { invoice: { projectId } } });
    await prisma.invoice.deleteMany({ where: { projectId } });
    await prisma.milestone.deleteMany({ where: { projectId } });
  });
  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.payment.deleteMany({ where: { customerId } });
        await prisma.payment.deleteMany({ where: { invoice: { projectId } } });
        await prisma.invoice.deleteMany({ where: { projectId } });
        await prisma.milestone.deleteMany({ where: { projectId } });
        await prisma.project.deleteMany({ where: { id: projectId } });
        await prisma.customer.deleteMany({ where: { id: customerId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
    } finally {
      if (app) await app.close();
    }
  });

  it('persists creation, issuance, decimal payments and dashboard balances', async () => {
    expect(invoice).toMatchObject({
      status: 'DRAFT',
      paidAmount: 0,
      outstandingAmount: 1000.25,
    });
    await issue();
    expect((await persisted()).invoiceNumber).toMatch(/^INV-\d{6}-\d{4}$/);
    await payment(250.1).expect(201);
    const partial = await persisted();
    expect(partial.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(partial.paidAmount.equals(new Prisma.Decimal('250.10'))).toBe(true);
    expect(partial.outstandingAmount.equals(new Prisma.Decimal('750.15'))).toBe(
      true,
    );
    const dashboard = await request(server())
      .get('/analytics/dashboard/summary')
      .query({ fromDate: invoiceDate, toDate: invoiceDate })
      .expect(200);
    expect((dashboard.body as DashboardBody).revenue).toMatchObject({
      totalRevenue: 1000.25,
      paidAmount: 250.1,
      outstandingBalance: 750.15,
    });
    expect((dashboard.body as DashboardBody).projects.totalProjects).toBe(1);
    const client = await request(server())
      .get(`/reports/finance/clients/${customerId}/summary`)
      .expect(200);
    expect(client.body as Record<string, unknown>).toMatchObject({
      totalPaidAmount: 250.1,
      outstandingBalance: 750.15,
    });
    const project = await request(server())
      .get(`/reports/finance/projects/${projectId}/summary`)
      .expect(200);
    expect(project.body as Record<string, unknown>).toMatchObject({
      revenue: 1000.25,
      paidAmount: 250.1,
      outstandingAmount: 750.15,
    });
    await payment(750.15).expect(201);
    const paid = await persisted();
    expect(paid.status).toBe(InvoiceStatus.PAID);
    expect(paid.outstandingAmount.toNumber()).toBe(0);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(2);
    await request(server()).get(`/invoices/${invoice.id}/payments`).expect(200);
    await request(server()).get(`/invoices/${invoice.id}`).expect(200);
    await request(server()).get('/invoices').query({ projectId }).expect(200);
    await request(server())
      .get('/reports/finance/invoices/outstanding')
      .query({ fromDate: invoiceDate, toDate: invoiceDate })
      .expect(200);
  });

  it('rejects invalid requests without creating records', async () => {
    const count = await prisma.invoice.count({ where: { projectId } });
    await request(server())
      .post('/invoices')
      .send({ projectId, customerId, invoiceDate, totalAmount: -1 })
      .expect(400);
    await request(server())
      .post('/invoices')
      .send({
        projectId: randomUUID(),
        customerId,
        invoiceDate,
        totalAmount: 1,
      })
      .expect(404);
    await payment(-1).expect(400);
    expect(await prisma.invoice.count({ where: { projectId } })).toBe(count);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(0);
  });

  it('rolls back duplicate and excessive payments and preserves persisted balances', async () => {
    await issue();
    const reference = randomUUID();
    await payment(250.1, reference).expect(201);
    await payment(1, reference).expect(409);
    await payment(800).expect(422);
    const result = await persisted();
    expect(result.paidAmount.toNumber()).toBe(250.1);
    expect(result.outstandingAmount.toNumber()).toBe(750.15);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(1);
    await request(server())
      .patch(`/invoices/${invoice.id}`)
      .send({ totalAmount: 500 })
      .expect(409);
  });

  it('rejects draft, cancelled and fully-paid invoice payments', async () => {
    await payment(1).expect(409);
    await request(server()).patch(`/invoices/${invoice.id}/cancel`).expect(200);
    await payment(1).expect(409);
    expect((await persisted()).status).toBe(InvoiceStatus.CANCELLED);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(0);
    const response = await request(server())
      .post(`/projects/${projectId}/invoices`)
      .send({ customerId, invoiceDate, totalAmount: 1, status: 'ISSUED' })
      .expect(201);
    invoice = response.body as InvoiceBody;
    await payment(1).expect(201);
    await payment(1).expect(409);
    await request(server()).patch(`/invoices/${invoice.id}/cancel`).expect(409);
  });

  it('serializes competing payments so the invoice cannot be overpaid', async () => {
    await issue();
    const responses = await Promise.all([payment(750), payment(750)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 422,
    ]);
    expect((await persisted()).paidAmount.toNumber()).toBe(750);
    expect(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
    ).toBe(1);
  });

  it('uses persisted ERP history for AI prediction without a paid provider', async () => {
    const path = `/ai-forecasting/projects/${projectId}/risk`;
    const sparse = await request(server()).get(path).expect(200);
    expect(sparse.body as PredictionBody).toMatchObject({
      projectId,
      sufficientData: false,
      predictionSource: 'SAFE_FALLBACK',
    });
    expect(provider.predictViaProvider).not.toHaveBeenCalled();
    await issue();
    await payment(250.1).expect(201);
    await prisma.milestone.createMany({
      data: [
        {
          projectId,
          milestoneName: 'Foundation',
          weight: 50,
          dueDate: new Date(invoiceDate),
        },
        {
          projectId,
          milestoneName: 'Roof',
          weight: 50,
          dueDate: new Date(invoiceDate),
        },
      ],
    });
    const prediction = await request(server()).get(path).expect(200);
    expect(prediction.body as PredictionBody).toMatchObject({
      projectId,
      sufficientData: true,
      predictionSource: 'RULE_BASED',
    });
    expect(
      (prediction.body as PredictionBody).explanation.length,
    ).toBeGreaterThan(0);
    expect(provider.predictViaProvider).toHaveBeenCalledTimes(1);
  });
});
