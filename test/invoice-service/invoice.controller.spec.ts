import {
  FinanceReportsController,
  InvoiceController,
  ProjectInvoiceController,
} from '../../apps/invoice-service/src/invoice.controller';
import { FinanceSummaryService } from '../../apps/invoice-service/src/finance-summary.service';
import { InvoiceService } from '../../apps/invoice-service/src/invoice.service';

describe('Invoice controllers', () => {
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

  let invoiceController: InvoiceController;
  let projectInvoiceController: ProjectInvoiceController;
  let financeReportsController: FinanceReportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    invoiceController = new InvoiceController(
      invoiceService as unknown as InvoiceService,
    );
    projectInvoiceController = new ProjectInvoiceController(
      invoiceService as unknown as InvoiceService,
    );
    financeReportsController = new FinanceReportsController(
      financeSummaryService as unknown as FinanceSummaryService,
    );
  });

  it('delegates invoice creation', async () => {
    const dto = {
      projectId: '00000000-0000-4000-8000-000000000001',
      customerId: '00000000-0000-4000-8000-000000000002',
      invoiceDate: '2026-06-22',
      totalAmount: 1000,
    };
    const response = { id: 'inv-1' };
    invoiceService.create.mockResolvedValue(response);

    await expect(invoiceController.create(dto, 'actor-1')).resolves.toBe(
      response,
    );
    expect(invoiceService.create).toHaveBeenCalledWith(dto, 'actor-1');
  });

  it('delegates invoice listing', async () => {
    const query = { page: 1, limit: 20 };
    const response = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    invoiceService.findAll.mockResolvedValue(response);

    await expect(invoiceController.findAll(query)).resolves.toBe(response);
    expect(invoiceService.findAll).toHaveBeenCalledWith(query);
  });

  it('delegates invoice lookup', async () => {
    const response = { id: 'inv-1' };
    invoiceService.findOne.mockResolvedValue(response);

    await expect(
      invoiceController.findOne('00000000-0000-4000-8000-000000000003'),
    ).resolves.toBe(response);
    expect(invoiceService.findOne).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
    );
  });

  it('delegates invoice updates', async () => {
    const dto = { totalAmount: 1200 };
    const response = { id: 'inv-1', totalAmount: 1200 };
    invoiceService.update.mockResolvedValue(response);

    await expect(
      invoiceController.update(
        '00000000-0000-4000-8000-000000000003',
        dto,
        'actor-2',
      ),
    ).resolves.toBe(response);
    expect(invoiceService.update).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
      dto,
      'actor-2',
    );
  });

  it('delegates invoice cancellation', async () => {
    const response = { id: 'inv-1', status: 'CANCELLED' };
    invoiceService.cancel.mockResolvedValue(response);

    await expect(
      invoiceController.cancel(
        '00000000-0000-4000-8000-000000000003',
        'actor-3',
      ),
    ).resolves.toBe(response);
    expect(invoiceService.cancel).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
      'actor-3',
    );
  });

  it('delegates invoice PDF generation', async () => {
    const dto = { forceRegenerate: true };
    const response = { id: 'inv-1', pdfUrl: 'http://example.test/inv-1.pdf' };
    invoiceService.generatePdf.mockResolvedValue(response);

    await expect(
      invoiceController.generatePdf(
        '00000000-0000-4000-8000-000000000003',
        dto,
        'actor-4',
      ),
    ).resolves.toBe(response);
    expect(invoiceService.generatePdf).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000003',
      dto,
      'actor-4',
    );
  });

  it('delegates project-scoped invoice creation', async () => {
    const dto = {
      customerId: '00000000-0000-4000-8000-000000000002',
      invoiceDate: '2026-06-22',
      totalAmount: 900,
    };
    const response = { id: 'inv-2' };
    invoiceService.createForProject.mockResolvedValue(response);

    await expect(
      projectInvoiceController.createForProject(
        '00000000-0000-4000-8000-000000000001',
        dto,
        'actor-5',
      ),
    ).resolves.toBe(response);
    expect(invoiceService.createForProject).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      dto,
      'actor-5',
    );
  });

  it('delegates client finance summaries', async () => {
    const query = { fromDate: '2026-06-01', toDate: '2026-06-30' };
    const response = { customerId: 'cust-1' };
    financeSummaryService.clientSummary.mockResolvedValue(response);

    await expect(
      financeReportsController.clientSummary(
        '00000000-0000-4000-8000-000000000002',
        query,
      ),
    ).resolves.toBe(response);
    expect(financeSummaryService.clientSummary).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000002',
      query,
    );
  });

  it('delegates project finance summaries', async () => {
    const query = { fromDate: '2026-06-01', toDate: '2026-06-30' };
    const response = { projectId: 'proj-1' };
    financeSummaryService.projectSummary.mockResolvedValue(response);

    await expect(
      financeReportsController.projectSummary(
        '00000000-0000-4000-8000-000000000001',
        query,
      ),
    ).resolves.toBe(response);
    expect(financeSummaryService.projectSummary).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      query,
    );
  });

  it('delegates outstanding invoice reports', async () => {
    const query = { page: 1, limit: 20 };
    const response = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    financeSummaryService.outstandingInvoices.mockResolvedValue(response);

    await expect(
      financeReportsController.outstandingInvoices(query),
    ).resolves.toBe(response);
    expect(financeSummaryService.outstandingInvoices).toHaveBeenCalledWith(
      query,
    );
  });
});
