/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ProjectStatus } from '@prisma/client';
import { AnalyticsController } from '../../apps/analytics-service/src/analytics.controller';
import { AnalyticsService } from '../../apps/analytics-service/src/analytics.service';

describe('Analytics Service routes - integration', () => {
  let app: INestApplication;

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

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: analyticsService,
        },
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

  it('GET /analytics/kpis/revenue returns revenue KPIs', async () => {
    analyticsService.revenueKpis.mockResolvedValue({
      totalRevenue: 12000,
      paidAmount: 9000,
      outstandingBalance: 3000,
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/kpis/revenue')
      .query({ fromDate: '2026-06-01', toDate: '2026-06-30' })
      .expect(200);

    expect(response.body.totalRevenue).toBe(12000);
    expect(analyticsService.revenueKpis).toHaveBeenCalledWith({
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
    });
  });

  it('GET /analytics/kpis/projects returns project KPIs', async () => {
    analyticsService.projectKpis.mockResolvedValue({
      totalProjects: 5,
      activeProjectCount: 2,
      completedProjectCount: 2,
      overdueProjectCount: 1,
      completionRate: 40,
      fromDate: null,
      toDate: null,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/kpis/projects')
      .expect(200);

    expect(response.body.totalProjects).toBe(5);
  });

  it('GET /analytics/kpis/invoices returns invoice KPIs', async () => {
    analyticsService.invoiceKpis.mockResolvedValue({
      draftCount: 1,
      issuedCount: 1,
      partiallyPaidCount: 1,
      paidCount: 2,
      overdueCount: 1,
      cancelledCount: 0,
      totalInvoices: 6,
      fromDate: null,
      toDate: null,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/kpis/invoices')
      .expect(200);

    expect(response.body.totalInvoices).toBe(6);
  });

  it('GET /analytics/kpis/sales returns sales KPIs', async () => {
    analyticsService.salesKpis.mockResolvedValue({
      totalLeads: 10,
      convertedLeads: 4,
      leadConversionRate: 40,
      quotationApprovalCount: 5,
      rejectedQuotationCount: 1,
      convertedQuotationCount: 3,
      totalQuotations: 10,
      fromDate: null,
      toDate: null,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/kpis/sales')
      .expect(200);

    expect(response.body.leadConversionRate).toBe(40);
  });

  it('GET /analytics/dashboard/summary returns the combined dashboard payload', async () => {
    analyticsService.dashboardSummary.mockResolvedValue({
      revenue: { totalRevenue: 12000 },
      projects: { totalProjects: 5 },
      invoices: { totalInvoices: 6 },
      sales: { totalLeads: 10 },
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/dashboard/summary')
      .expect(200);

    expect(response.body.revenue.totalRevenue).toBe(12000);
    expect(response.body.projects.totalProjects).toBe(5);
  });

  it('GET /analytics/reports/recent-activity returns paginated activity data', async () => {
    analyticsService.recentActivity.mockResolvedValue({
      items: [
        {
          type: 'invoice',
          entityId: 'inv-1',
          title: 'Invoice INV-001',
          description: 'Invoice ISSUED for 1200',
          occurredAt: '2026-06-25T00:00:00.000Z',
          relatedProjectId: 'proj-1',
          relatedProjectName: 'Alpha',
        },
      ],
      total: 1,
      page: 2,
      limit: 5,
      totalPages: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/reports/recent-activity')
      .query({ page: '2', limit: '5', activityTypes: ['invoice', 'payment'] })
      .expect(200);

    expect(response.body.page).toBe(2);
    expect(analyticsService.recentActivity).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      activityTypes: ['invoice', 'payment'],
    });
  });

  it('GET /analytics/reports/project-completion returns project completion data', async () => {
    analyticsService.projectCompletionReport.mockResolvedValue({
      items: [
        {
          projectId: 'proj-1',
          projectName: 'Alpha',
          status: ProjectStatus.ACTIVE,
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: null,
          budget: 100000,
          milestoneCount: 2,
          completedMilestoneCount: 1,
          completionPercentage: 50,
          milestones: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/reports/project-completion')
      .query({ page: '1', limit: '10', status: ProjectStatus.ACTIVE })
      .expect(200);

    expect(response.body.items[0].projectId).toBe('proj-1');
  });

  it('GET /analytics/reports/expenses returns grouped expense data', async () => {
    analyticsService.expenseReport.mockResolvedValue({
      items: [
        {
          projectId: 'proj-1',
          projectName: 'Alpha',
          totalExpense: 600.25,
          expenseCount: 2,
          firstExpenseAt: '2026-06-01T00:00:00.000Z',
          lastExpenseAt: '2026-06-03T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      summary: {
        totalExpense: 600.25,
        totalExpenseCount: 2,
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/reports/expenses')
      .query({
        page: '1',
        limit: '10',
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      })
      .expect(200);

    expect(response.body.summary.totalExpense).toBe(600.25);
  });

  it('GET /analytics/reports/overdue-invoices returns overdue invoice data', async () => {
    analyticsService.overdueInvoiceReport.mockResolvedValue({
      items: [
        {
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          status: 'OVERDUE',
          invoiceDate: '2026-05-01T00:00:00.000Z',
          dueDate: '2026-05-10T00:00:00.000Z',
          outstandingAmount: 750,
          totalAmount: 1000,
          paidAmount: 250,
          customerId: 'cust-1',
          customerName: 'Client A',
          projectId: 'proj-1',
          projectName: 'Alpha',
          daysOverdue: 5,
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });

    const response = await request(app.getHttpServer())
      .get('/analytics/reports/overdue-invoices')
      .query({ page: '1', limit: '10' })
      .expect(200);

    expect(response.body.items[0].invoiceId).toBe('inv-1');
  });

  it('rejects invalid KPI date query params before hitting the service', async () => {
    await request(app.getHttpServer())
      .get('/analytics/kpis/revenue')
      .query({ fromDate: 'not-a-date' })
      .expect(400);

    expect(analyticsService.revenueKpis).not.toHaveBeenCalled();
  });

  it('rejects invalid report pagination and enum query params before hitting the service', async () => {
    await request(app.getHttpServer())
      .get('/analytics/reports/project-completion')
      .query({ page: '0', sortOrder: 'sideways' })
      .expect(400);

    expect(analyticsService.projectCompletionReport).not.toHaveBeenCalled();
  });

  it('surfaces service-level bad request errors as HTTP 400 responses', async () => {
    analyticsService.dashboardSummary.mockRejectedValue(
      new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'toDate cannot be before fromDate.',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/analytics/dashboard/summary')
      .query({ fromDate: '2026-07-01', toDate: '2026-06-01' })
      .expect(400);

    expect(response.body.code).toBe('INVALID_DATE_RANGE');
  });
});
