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
}
