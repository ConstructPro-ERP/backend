import { ApiProperty } from '@nestjs/swagger';

/** Invoice monetary totals in the requested invoice-date range. */
export class RevenueKpiDto {
  @ApiProperty({
    description: 'Sum of invoice total amounts, rounded to two decimal places.',
    example: 12000,
  })
  totalRevenue!: number;

  @ApiProperty({
    description: 'Sum of invoice paid amounts, rounded to two decimal places.',
    example: 9000,
  })
  paidAmount!: number;

  @ApiProperty({
    description:
      'Sum of invoice outstanding amounts, rounded to two decimal places.',
    example: 3000,
  })
  outstandingBalance!: number;

  @ApiProperty({
    description: 'Supplied inclusive start-date filter, or null.',
    example: '2026-06-01',
    nullable: true,
  })
  fromDate!: string | null;

  @ApiProperty({
    description: 'Supplied inclusive end-date filter, or null.',
    example: '2026-06-30',
    nullable: true,
  })
  toDate!: string | null;
}

/** Project counts and status-based completion KPIs. */
export class ProjectKpiDto {
  @ApiProperty({
    description:
      'Total number of projects matching the project creation-date filter.',
    example: 8,
    minimum: 0,
  })
  totalProjects!: number;

  @ApiProperty({
    description: 'Number of projects with ACTIVE status.',
    example: 3,
    minimum: 0,
  })
  activeProjectCount!: number;

  @ApiProperty({
    description: 'Number of projects with COMPLETED status.',
    example: 2,
    minimum: 0,
  })
  completedProjectCount!: number;

  @ApiProperty({
    description:
      'Number of projects past their end date, excluding COMPLETED and CANCELLED projects.',
    example: 1,
    minimum: 0,
  })
  overdueProjectCount!: number;

  @ApiProperty({
    description:
      'Percentage of matching projects with COMPLETED status; this is not the weighted progress of individual projects.',
    example: 25,
    minimum: 0,
    maximum: 100,
  })
  completionRate!: number;

  @ApiProperty({
    description: 'Supplied inclusive start-date filter, or null.',
    example: '2026-06-01',
    nullable: true,
  })
  fromDate!: string | null;

  @ApiProperty({
    description: 'Supplied inclusive end-date filter, or null.',
    example: '2026-06-30',
    nullable: true,
  })
  toDate!: string | null;
}

/** Invoice counts grouped by current invoice status. */
export class InvoiceKpiDto {
  @ApiProperty({
    description: 'Count of DRAFT invoices.',
    example: 1,
    minimum: 0,
  })
  draftCount!: number;

  @ApiProperty({
    description: 'Count of ISSUED invoices.',
    example: 2,
    minimum: 0,
  })
  issuedCount!: number;

  @ApiProperty({
    description: 'Count of PARTIALLY_PAID invoices.',
    example: 3,
    minimum: 0,
  })
  partiallyPaidCount!: number;

  @ApiProperty({
    description: 'Count of PAID invoices.',
    example: 4,
    minimum: 0,
  })
  paidCount!: number;

  @ApiProperty({
    description: 'Count of OVERDUE invoices.',
    example: 5,
    minimum: 0,
  })
  overdueCount!: number;

  @ApiProperty({
    description: 'Count of CANCELLED invoices.',
    example: 0,
    minimum: 0,
  })
  cancelledCount!: number;

  @ApiProperty({
    description: 'Total number of matching invoices across all statuses.',
    example: 15,
    minimum: 0,
  })
  totalInvoices!: number;

  @ApiProperty({
    description: 'Supplied inclusive start-date filter, or null.',
    example: '2026-06-01',
    nullable: true,
  })
  fromDate!: string | null;

  @ApiProperty({
    description: 'Supplied inclusive end-date filter, or null.',
    example: '2026-06-30',
    nullable: true,
  })
  toDate!: string | null;
}

/** Lead conversion and quotation status metrics. */
export class SalesKpiDto {
  @ApiProperty({
    description: 'Number of leads matching the lead creation-date filter.',
    example: 10,
    minimum: 0,
  })
  totalLeads!: number;

  @ApiProperty({
    description: 'Number of matching leads with CONVERTED status.',
    example: 4,
    minimum: 0,
  })
  convertedLeads!: number;

  @ApiProperty({
    description:
      'Converted leads as a percentage of total matching leads (zero when there are none).',
    example: 40,
    minimum: 0,
    maximum: 100,
  })
  leadConversionRate!: number;

  @ApiProperty({
    description: 'Number of quotations in APPROVED or CONVERTED status.',
    example: 5,
    minimum: 0,
  })
  quotationApprovalCount!: number;

  @ApiProperty({
    description: 'Number of REJECTED quotations.',
    example: 1,
    minimum: 0,
  })
  rejectedQuotationCount!: number;

  @ApiProperty({
    description: 'Number of CONVERTED quotations.',
    example: 3,
    minimum: 0,
  })
  convertedQuotationCount!: number;

  @ApiProperty({
    description:
      'Total number of quotations matching the quotation-date filter.',
    example: 10,
    minimum: 0,
  })
  totalQuotations!: number;

  @ApiProperty({
    description: 'Supplied inclusive start-date filter, or null.',
    example: '2026-06-01',
    nullable: true,
  })
  fromDate!: string | null;

  @ApiProperty({
    description: 'Supplied inclusive end-date filter, or null.',
    example: '2026-06-30',
    nullable: true,
  })
  toDate!: string | null;
}

/** Combined Analytics dashboard payload, preserving the individual KPI schemas. */
export class DashboardSummaryDto {
  @ApiProperty({
    description: 'Invoice amount and payment KPIs.',
    type: RevenueKpiDto,
  })
  revenue!: RevenueKpiDto;

  @ApiProperty({
    description: 'Project status and overdue KPIs.',
    type: ProjectKpiDto,
  })
  projects!: ProjectKpiDto;

  @ApiProperty({
    description: 'Invoice counts by status.',
    type: InvoiceKpiDto,
  })
  invoices!: InvoiceKpiDto;

  @ApiProperty({
    description: 'Lead conversion and quotation KPIs.',
    type: SalesKpiDto,
  })
  sales!: SalesKpiDto;
}
