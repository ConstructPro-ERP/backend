import { ApiProperty } from '@nestjs/swagger';

export class RevenueKpiDto {
  @ApiProperty() totalRevenue!: number;
  @ApiProperty() paidAmount!: number;
  @ApiProperty() outstandingBalance!: number;
  @ApiProperty({ nullable: true }) fromDate!: string | null;
  @ApiProperty({ nullable: true }) toDate!: string | null;
}

export class ProjectKpiDto {
  @ApiProperty() totalProjects!: number;
  @ApiProperty() activeProjectCount!: number;
  @ApiProperty() completedProjectCount!: number;
  @ApiProperty() overdueProjectCount!: number;
  @ApiProperty() completionRate!: number;
  @ApiProperty({ nullable: true }) fromDate!: string | null;
  @ApiProperty({ nullable: true }) toDate!: string | null;
}

export class InvoiceKpiDto {
  @ApiProperty() draftCount!: number;
  @ApiProperty() issuedCount!: number;
  @ApiProperty() partiallyPaidCount!: number;
  @ApiProperty() paidCount!: number;
  @ApiProperty() overdueCount!: number;
  @ApiProperty() cancelledCount!: number;
  @ApiProperty() totalInvoices!: number;
  @ApiProperty({ nullable: true }) fromDate!: string | null;
  @ApiProperty({ nullable: true }) toDate!: string | null;
}

export class SalesKpiDto {
  @ApiProperty() totalLeads!: number;
  @ApiProperty() convertedLeads!: number;
  @ApiProperty() leadConversionRate!: number;
  @ApiProperty() quotationApprovalCount!: number;
  @ApiProperty() rejectedQuotationCount!: number;
  @ApiProperty() convertedQuotationCount!: number;
  @ApiProperty() totalQuotations!: number;
  @ApiProperty({ nullable: true }) fromDate!: string | null;
  @ApiProperty({ nullable: true }) toDate!: string | null;
}

export class DashboardSummaryDto {
  @ApiProperty({ type: RevenueKpiDto }) revenue!: RevenueKpiDto;
  @ApiProperty({ type: ProjectKpiDto }) projects!: ProjectKpiDto;
  @ApiProperty({ type: InvoiceKpiDto }) invoices!: InvoiceKpiDto;
  @ApiProperty({ type: SalesKpiDto }) sales!: SalesKpiDto;
}
