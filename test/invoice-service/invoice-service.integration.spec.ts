import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, {
  type Response as SupertestResponse,
  type Test as SupertestTest,
} from 'supertest';
import {
  FinanceReportsController,
  InvoiceController,
  ProjectInvoiceController,
} from '../../apps/invoice-service/src/invoice.controller';
import { FinanceSummaryService } from '../../apps/invoice-service/src/finance-summary.service';
import { InvoiceService } from '../../apps/invoice-service/src/invoice.service';

type RequestTarget = Parameters<typeof request>[0];
type InvoiceBody = {
  id: string;
  totalAmount?: number;
  status?: string;
  pdfUrl?: string;
};
type InvoiceListBody = { page: number };
type FinanceClientBody = { customerId: string; code?: string };
type FinanceProjectBody = { projectId: string };
type OutstandingBody = { totalOutstandingAmount: number };

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

describe('Invoice Service routes - integration', () => {
  let app: INestApplication;

  const invoiceService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
    generatePdf: jest.fn(),
    createForProject: jest.fn(),
  };

  const financeSummaryService = {
    clientSummary: jest.fn(),
    projectSummary: jest.fn(),
    outstandingInvoices: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        InvoiceController,
        ProjectInvoiceController,
        FinanceReportsController,
      ],
      providers: [
        { provide: InvoiceService, useValue: invoiceService },
        { provide: FinanceSummaryService, useValue: financeSummaryService },
      ],
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

  it('POST /invoices creates an invoice', async () => {
    invoiceService.create.mockResolvedValue({ id: 'inv-1', totalAmount: 1000 });

    const response = await expectResponse(
      request(serverOf(app))
        .post('/invoices')
        .set('x-user-id', 'actor-1')
        .send({
          projectId: '00000000-0000-4000-8000-000000000001',
          customerId: '00000000-0000-4000-8000-000000000002',
          invoiceDate: '2026-06-22T00:00:00.000Z',
          totalAmount: 1000,
        }),
      201,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.id).toBe('inv-1');
    expect(invoiceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: '00000000-0000-4000-8000-000000000001',
        customerId: '00000000-0000-4000-8000-000000000002',
        totalAmount: 1000,
      }),
      'actor-1',
    );
  });

  it('GET /invoices lists invoices with validated query params', async () => {
    invoiceService.findAll.mockResolvedValue({
      items: [{ id: 'inv-1' }],
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
    });

    const response = await expectResponse(
      request(serverOf(app))
        .get('/invoices')
        .query({ page: '2', limit: '5', sortOrder: 'desc' }),
      200,
    );
    const body = responseBody<InvoiceListBody>(response);

    expect(body.page).toBe(2);
    expect(invoiceService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5, sortOrder: 'desc' }),
    );
  });

  it('GET /invoices/:id returns invoice details', async () => {
    invoiceService.findOne.mockResolvedValue({ id: 'inv-1' });

    const response = await expectResponse(
      request(serverOf(app)).get(
        '/invoices/00000000-0000-4000-8000-000000000003',
      ),
      200,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.id).toBe('inv-1');
  });

  it('PATCH /invoices/:id updates an invoice', async () => {
    invoiceService.update.mockResolvedValue({ id: 'inv-1', totalAmount: 1200 });

    const response = await expectResponse(
      request(serverOf(app))
        .patch('/invoices/00000000-0000-4000-8000-000000000003')
        .set('x-user-id', 'actor-2')
        .send({ totalAmount: 1200 }),
      200,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.totalAmount).toBe(1200);
  });

  it('PATCH /invoices/:id/cancel cancels an invoice', async () => {
    invoiceService.cancel.mockResolvedValue({
      id: 'inv-1',
      status: 'CANCELLED',
    });

    const response = await expectResponse(
      request(serverOf(app))
        .patch('/invoices/00000000-0000-4000-8000-000000000003/cancel')
        .set('x-user-id', 'actor-3'),
      200,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.status).toBe('CANCELLED');
  });

  it('POST /invoices/:id/pdf triggers PDF generation', async () => {
    invoiceService.generatePdf.mockResolvedValue({
      id: 'inv-1',
      pdfUrl: 'http://localhost:4010/files/invoices/INV-1.pdf',
    });

    const response = await expectResponse(
      request(serverOf(app))
        .post('/invoices/00000000-0000-4000-8000-000000000003/pdf')
        .set('x-user-id', 'actor-4')
        .send({ forceRegenerate: true }),
      201,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.pdfUrl).toContain('/files/invoices/');
  });

  it('POST /projects/:projectId/invoices creates a project invoice', async () => {
    invoiceService.createForProject.mockResolvedValue({ id: 'inv-2' });

    const response = await expectResponse(
      request(serverOf(app))
        .post('/projects/00000000-0000-4000-8000-000000000001/invoices')
        .set('x-user-id', 'actor-5')
        .send({
          customerId: '00000000-0000-4000-8000-000000000002',
          invoiceDate: '2026-06-22T00:00:00.000Z',
          totalAmount: 900,
        }),
      201,
    );
    const body = responseBody<InvoiceBody>(response);

    expect(body.id).toBe('inv-2');
  });

  it('GET /reports/finance/clients/:customerId/summary returns a client summary', async () => {
    financeSummaryService.clientSummary.mockResolvedValue({
      customerId: 'cust-1',
      totalInvoicedAmount: 1500,
    });

    const response = await expectResponse(
      request(serverOf(app))
        .get(
          '/reports/finance/clients/00000000-0000-4000-8000-000000000002/summary',
        )
        .query({ fromDate: '2026-06-01', toDate: '2026-06-30' }),
      200,
    );
    const body = responseBody<FinanceClientBody>(response);

    expect(body.customerId).toBe('cust-1');
  });

  it('GET /reports/finance/projects/:projectId/summary returns a project summary', async () => {
    financeSummaryService.projectSummary.mockResolvedValue({
      projectId: 'proj-1',
      revenue: 5000,
    });

    const response = await expectResponse(
      request(serverOf(app)).get(
        '/reports/finance/projects/00000000-0000-4000-8000-000000000001/summary',
      ),
      200,
    );
    const body = responseBody<FinanceProjectBody>(response);

    expect(body.projectId).toBe('proj-1');
  });

  it('GET /reports/finance/invoices/outstanding returns the outstanding report', async () => {
    financeSummaryService.outstandingInvoices.mockResolvedValue({
      items: [{ id: 'inv-1' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      totalOutstandingAmount: 1250,
      fromDate: null,
      toDate: null,
    });

    const response = await expectResponse(
      request(serverOf(app))
        .get('/reports/finance/invoices/outstanding')
        .query({ page: '1', limit: '20', sortOrder: 'asc' }),
      200,
    );
    const body = responseBody<OutstandingBody>(response);

    expect(body.totalOutstandingAmount).toBe(1250);
  });

  it('rejects invalid invoice body payloads before hitting the service', async () => {
    await expectResponse(
      request(serverOf(app)).post('/invoices').send({
        projectId: 'not-a-uuid',
        customerId: '00000000-0000-4000-8000-000000000002',
        invoiceDate: '2026-06-22T00:00:00.000Z',
        totalAmount: 1000,
      }),
      400,
    );

    expect(invoiceService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid UUID params before hitting the service', async () => {
    await expectResponse(
      request(serverOf(app)).get('/invoices/not-a-uuid'),
      400,
    );

    expect(invoiceService.findOne).not.toHaveBeenCalled();
  });

  it('rejects invalid pagination query params before hitting the service', async () => {
    await expectResponse(
      request(serverOf(app))
        .get('/reports/finance/invoices/outstanding')
        .query({ page: '0', sortOrder: 'sideways' }),
      400,
    );

    expect(financeSummaryService.outstandingInvoices).not.toHaveBeenCalled();
  });

  it('surfaces service-level bad request errors as HTTP 400 responses', async () => {
    financeSummaryService.clientSummary.mockRejectedValue(
      new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'toDate cannot be before fromDate.',
      }),
    );

    const response = await expectResponse(
      request(serverOf(app))
        .get(
          '/reports/finance/clients/00000000-0000-4000-8000-000000000002/summary',
        )
        .query({ fromDate: '2026-07-01', toDate: '2026-06-01' }),
      400,
    );
    const body = responseBody<FinanceClientBody>(response);

    expect(body.code).toBe('INVALID_DATE_RANGE');
  });
});
