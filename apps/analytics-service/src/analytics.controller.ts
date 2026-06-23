import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { KpiQueryDto } from './dto/kpi-query.dto';
import {
  DashboardSummaryDto,
  InvoiceKpiDto,
  ProjectKpiDto,
  RevenueKpiDto,
  SalesKpiDto,
} from './dto/kpi-response.dto';
import {
  ExpenseReportQueryDto,
  OverdueInvoiceReportQueryDto,
  ProjectCompletionReportQueryDto,
  RecentActivityQueryDto,
} from './dto/reporting-query.dto';
import {
  ExpenseReportResponseDto,
  OverdueInvoiceReportResponseDto,
  ProjectCompletionReportResponseDto,
  RecentActivityResponseDto,
} from './dto/reporting-response.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpis/revenue')
  @ApiOperation({ summary: 'Get revenue dashboard KPIs' })
  @ApiOkResponse({ type: RevenueKpiDto })
  revenue(@Query() query: KpiQueryDto) {
    return this.analyticsService.revenueKpis(query);
  }

  @Get('kpis/projects')
  @ApiOperation({ summary: 'Get project dashboard KPIs' })
  @ApiOkResponse({ type: ProjectKpiDto })
  projects(@Query() query: KpiQueryDto) {
    return this.analyticsService.projectKpis(query);
  }

  @Get('kpis/invoices')
  @ApiOperation({ summary: 'Get invoice dashboard KPIs' })
  @ApiOkResponse({ type: InvoiceKpiDto })
  invoices(@Query() query: KpiQueryDto) {
    return this.analyticsService.invoiceKpis(query);
  }

  @Get('kpis/sales')
  @ApiOperation({ summary: 'Get lead and quotation dashboard KPIs' })
  @ApiOkResponse({ type: SalesKpiDto })
  sales(@Query() query: KpiQueryDto) {
    return this.analyticsService.salesKpis(query);
  }

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Get all dashboard KPI cards in one response' })
  @ApiOkResponse({ type: DashboardSummaryDto })
  summary(@Query() query: KpiQueryDto) {
    return this.analyticsService.dashboardSummary(query);
  }

  @Get('reports/recent-activity')
  @ApiOperation({ summary: 'Get a paginated recent activity feed' })
  @ApiOkResponse({ type: RecentActivityResponseDto })
  recentActivity(@Query() query: RecentActivityQueryDto) {
    return this.analyticsService.recentActivity(query);
  }

  @Get('reports/project-completion')
  @ApiOperation({
    summary: 'Get project completion progress with milestone breakdowns',
  })
  @ApiOkResponse({ type: ProjectCompletionReportResponseDto })
  projectCompletion(@Query() query: ProjectCompletionReportQueryDto) {
    return this.analyticsService.projectCompletionReport(query);
  }

  @Get('reports/expenses')
  @ApiOperation({ summary: 'Get project expense totals by project and date' })
  @ApiOkResponse({ type: ExpenseReportResponseDto })
  expenses(@Query() query: ExpenseReportQueryDto) {
    return this.analyticsService.expenseReport(query);
  }

  @Get('reports/overdue-invoices')
  @ApiOperation({ summary: 'Get overdue invoices with client and project info' })
  @ApiOkResponse({ type: OverdueInvoiceReportResponseDto })
  overdueInvoices(@Query() query: OverdueInvoiceReportQueryDto) {
    return this.analyticsService.overdueInvoiceReport(query);
  }
}
