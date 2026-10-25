import { AnalyticsController } from '../../apps/analytics-service/src/analytics.controller';
import { AnalyticsService } from '../../apps/analytics-service/src/analytics.service';
import {
  ActivityTypeDto,
  ExpenseReportSortByDto,
  OverdueInvoiceSortByDto,
  ProjectCompletionSortByDto,
  SortOrderDto,
} from '../../apps/analytics-service/src/dto/reporting-query.dto';

describe('AnalyticsController', () => {
  const analyticsService = {
    revenueKpis: jest.fn(),
    projectKpis: jest.fn(),
    invoiceKpis: jest.fn(),
    salesKpis: jest.fn(),
    dashboardSummary: jest.fn(),
    recentActivity: jest.fn(),
    projectCompletionReport: jest.fn(),
    expenseReport: jest.fn(),
    overdueInvoiceReport: jest.fn(),
  };

  let controller: AnalyticsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AnalyticsController(
      analyticsService as unknown as AnalyticsService,
    );
  });

  it('delegates revenue KPI queries', async () => {
    const query = { fromDate: '2026-06-01', toDate: '2026-06-30' };
    const response = { totalRevenue: 12000 };
    analyticsService.revenueKpis.mockResolvedValue(response);

    await expect(controller.revenue(query)).resolves.toBe(response);
    expect(analyticsService.revenueKpis).toHaveBeenCalledWith(query);
  });

  it('delegates project KPI queries', async () => {
    const query = { fromDate: '2026-06-01' };
    const response = { totalProjects: 6 };
    analyticsService.projectKpis.mockResolvedValue(response);

    await expect(controller.projects(query)).resolves.toBe(response);
    expect(analyticsService.projectKpis).toHaveBeenCalledWith(query);
  });

  it('delegates invoice KPI queries', async () => {
    const query = { toDate: '2026-06-30' };
    const response = { totalInvoices: 7 };
    analyticsService.invoiceKpis.mockResolvedValue(response);

    await expect(controller.invoices(query)).resolves.toBe(response);
    expect(analyticsService.invoiceKpis).toHaveBeenCalledWith(query);
  });

  it('delegates sales KPI queries', async () => {
    const query = {};
    const response = { totalLeads: 9 };
    analyticsService.salesKpis.mockResolvedValue(response);

    await expect(controller.sales(query)).resolves.toBe(response);
    expect(analyticsService.salesKpis).toHaveBeenCalledWith(query);
  });

  it('delegates dashboard summary queries', async () => {
    const query = { fromDate: '2026-06-01', toDate: '2026-06-30' };
    const response = { revenue: {}, projects: {}, invoices: {}, sales: {} };
    analyticsService.dashboardSummary.mockResolvedValue(response);

    await expect(controller.summary(query)).resolves.toBe(response);
    expect(analyticsService.dashboardSummary).toHaveBeenCalledWith(query);
  });

  it('delegates recent activity report queries', async () => {
    const query = {
      page: 2,
      limit: 5,
      activityTypes: [ActivityTypeDto.INVOICE],
    };
    const response = { items: [], total: 0, page: 2, limit: 5, totalPages: 0 };
    analyticsService.recentActivity.mockResolvedValue(response);

    await expect(controller.recentActivity(query)).resolves.toBe(response);
    expect(analyticsService.recentActivity).toHaveBeenCalledWith(query);
  });

  it('delegates project completion report queries', async () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: ProjectCompletionSortByDto.CREATED_AT,
      sortOrder: SortOrderDto.DESC,
    };
    const response = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    analyticsService.projectCompletionReport.mockResolvedValue(response);

    await expect(controller.projectCompletion(query)).resolves.toBe(response);
    expect(analyticsService.projectCompletionReport).toHaveBeenCalledWith(
      query,
    );
  });

  it('delegates expense report queries', async () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: ExpenseReportSortByDto.TOTAL_EXPENSE,
      sortOrder: SortOrderDto.DESC,
    };
    const response = {
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      summary: {
        totalExpense: 0,
        totalExpenseCount: 0,
        fromDate: null,
        toDate: null,
      },
    };
    analyticsService.expenseReport.mockResolvedValue(response);

    await expect(controller.expenses(query)).resolves.toBe(response);
    expect(analyticsService.expenseReport).toHaveBeenCalledWith(query);
  });

  it('delegates overdue invoice report queries', async () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: OverdueInvoiceSortByDto.DUE_DATE,
      sortOrder: SortOrderDto.ASC,
    };
    const response = { items: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    analyticsService.overdueInvoiceReport.mockResolvedValue(response);

    await expect(controller.overdueInvoices(query)).resolves.toBe(response);
    expect(analyticsService.overdueInvoiceReport).toHaveBeenCalledWith(query);
  });
});
