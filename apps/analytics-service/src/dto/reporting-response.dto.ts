import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus, MilestoneStatus, ProjectStatus } from '@prisma/client';
import { ActivityTypeDto } from './reporting-query.dto';

/** Shared pagination metadata for Analytics report responses. */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'Total number of matching records before pagination.',
    minimum: 0,
    example: 12,
  })
  total!: number;

  @ApiProperty({
    description: 'Current one-based page number.',
    minimum: 1,
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: 'Requested maximum number of records per page.',
    minimum: 1,
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: 'Total number of pages; zero when there are no matches.',
    minimum: 0,
    example: 1,
  })
  totalPages!: number;
}

/** A single event in the cross-service recent activity feed. */
export class RecentActivityItemDto {
  @ApiProperty({
    description: 'Category of the source record.',
    enum: ActivityTypeDto,
    example: ActivityTypeDto.INVOICE,
  })
  type!: ActivityTypeDto;

  @ApiProperty({
    description: 'Unique identifier of the source record.',
    example: 'invoice-id',
  })
  entityId!: string;

  @ApiProperty({
    description: 'Short display label for the activity.',
    example: 'Invoice INV-001',
  })
  title!: string;

  @ApiProperty({
    description: 'Human-readable explanation of the activity.',
    example: 'Invoice ISSUED for 1200',
  })
  description!: string;

  @ApiProperty({
    description: 'Creation timestamp used to order the activity feed.',
    type: String,
    format: 'date-time',
  })
  occurredAt!: Date;

  @ApiProperty({
    description: 'Associated project ID, if one exists.',
    nullable: true,
    example: null,
    type: String,
  })
  relatedProjectId!: string | null;

  @ApiProperty({
    description: 'Associated project name, if one exists.',
    nullable: true,
    example: null,
    type: String,
  })
  relatedProjectName!: string | null;
}

/** Paginated feed of recent activity from multiple domains. */
export class RecentActivityResponseDto extends PaginationMetaDto {
  @ApiProperty({
    description: 'Activity entries for the requested page, newest first.',
    type: [RecentActivityItemDto],
  })
  items!: RecentActivityItemDto[];
}

/** Milestone-level progress and task counts within a project report. */
export class ProjectMilestoneSummaryDto {
  @ApiProperty({
    description: 'Unique milestone identifier.',
    example: 'milestone-id',
  })
  id!: string;

  @ApiProperty({ description: 'Milestone title.', example: 'Foundation' })
  milestoneName!: string;

  @ApiProperty({
    description: 'Milestone lifecycle status.',
    enum: MilestoneStatus,
  })
  status!: MilestoneStatus;

  @ApiProperty({
    description: 'Target completion date, or null if unset.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  dueDate!: Date | null;

  @ApiProperty({
    description: 'Number of tasks associated with this milestone.',
    minimum: 0,
    example: 4,
  })
  taskCount!: number;

  @ApiProperty({
    description:
      'Number of associated tasks with COMPLETED status. This count does not determine milestone progress.',
    minimum: 0,
    example: 2,
  })
  completedTaskCount!: number;

  @ApiProperty({
    description:
      'Persisted milestone progress (0–100), independent of task completion counts.',
    minimum: 0,
    maximum: 100,
    example: 50,
  })
  completionPercentage!: number;
}

/** Project completion entry based on the canonical persisted weighted progress. */
export class ProjectCompletionItemDto {
  @ApiProperty({
    description: 'Unique project identifier.',
    example: 'project-id',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Project display name.',
    example: 'Alpha Construction',
  })
  projectName!: string;

  @ApiProperty({
    description: 'Current project lifecycle status.',
    enum: ProjectStatus,
  })
  status!: ProjectStatus;

  @ApiProperty({
    description: 'Planned project start date.',
    type: String,
    format: 'date-time',
  })
  startDate!: Date;

  @ApiProperty({
    description: 'Planned project end date, or null if unset.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  endDate!: Date | null;

  @ApiProperty({
    description: 'Project budget in the configured currency, or null if unset.',
    type: Number,
    nullable: true,
    example: 100000,
  })
  budget!: number | null;

  @ApiProperty({
    description: 'Number of milestones associated with this project.',
    minimum: 0,
    example: 3,
  })
  milestoneCount!: number;

  @ApiProperty({
    description:
      'Number of milestones with COMPLETED status; not used to derive weighted project progress.',
    minimum: 0,
    example: 1,
  })
  completedMilestoneCount!: number;

  @ApiProperty({
    description:
      'Persisted project progress (0–100), weighted by milestone relative weights. Not the ratio of completed milestones.',
    minimum: 0,
    maximum: 100,
    example: 65,
  })
  completionPercentage!: number;

  @ApiProperty({
    description: 'Milestone progress and task-count breakdown.',
    type: [ProjectMilestoneSummaryDto],
  })
  milestones!: ProjectMilestoneSummaryDto[];
}

/** Paginated project completion report. */
export class ProjectCompletionReportResponseDto extends PaginationMetaDto {
  @ApiProperty({
    description: 'Projects matching the report filters, including milestones.',
    type: [ProjectCompletionItemDto],
  })
  items!: ProjectCompletionItemDto[];
}

/** Expense aggregation for one project. */
export class ExpenseReportItemDto {
  @ApiProperty({
    description: 'Unique project identifier.',
    example: 'project-id',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Project display name.',
    example: 'Alpha Construction',
  })
  projectName!: string;

  @ApiProperty({
    description:
      'Sum of recorded expense amounts for the project, rounded to two decimal places.',
    example: 600.25,
  })
  totalExpense!: number;

  @ApiProperty({
    description: 'Number of expense records included in the total.',
    minimum: 0,
    example: 2,
  })
  expenseCount!: number;

  @ApiProperty({
    description: 'Creation time of the earliest matching expense, or null.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  firstExpenseAt!: Date | null;

  @ApiProperty({
    description: 'Creation time of the latest matching expense, or null.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  lastExpenseAt!: Date | null;
}

/** Aggregate expense values and applied date filters. */
export class ExpenseReportSummaryDto {
  @ApiProperty({
    description:
      'Sum of all matching expenses across projects, rounded to two decimal places.',
    example: 950.45,
  })
  totalExpense!: number;

  @ApiProperty({
    description: 'Total number of matching expense records.',
    minimum: 0,
    example: 3,
  })
  totalExpenseCount!: number;

  @ApiProperty({
    description: 'Supplied inclusive lower date filter, or null.',
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-06-01',
  })
  fromDate!: string | null;

  @ApiProperty({
    description: 'Supplied inclusive upper date filter, or null.',
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-06-30',
  })
  toDate!: string | null;
}

/** Paginated grouped expense results with an overall summary. */
export class ExpenseReportResponseDto extends PaginationMetaDto {
  @ApiProperty({
    description: 'Per-project expense aggregates.',
    type: [ExpenseReportItemDto],
  })
  items!: ExpenseReportItemDto[];

  @ApiProperty({
    description: 'Summary across all matching expenses before pagination.',
    type: ExpenseReportSummaryDto,
  })
  summary!: ExpenseReportSummaryDto;
}

/** Outstanding invoice detail in the overdue-invoice report. */
export class OverdueInvoiceItemDto {
  @ApiProperty({
    description: 'Unique invoice identifier.',
    example: 'invoice-id',
  })
  invoiceId!: string;

  @ApiProperty({
    description: 'Human-readable invoice number, or null when not assigned.',
    type: String,
    nullable: true,
    example: 'INV-001',
  })
  invoiceNumber!: string | null;

  @ApiProperty({
    description:
      'Current invoice status; entries in this report have OVERDUE status.',
    enum: InvoiceStatus,
    example: InvoiceStatus.OVERDUE,
  })
  status!: InvoiceStatus;

  @ApiProperty({
    description: 'Invoice issue date.',
    type: String,
    format: 'date-time',
  })
  invoiceDate!: Date;

  @ApiProperty({
    description: 'Payment due date, or null when unset.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  dueDate!: Date | null;

  @ApiProperty({
    description: 'Unpaid amount on the invoice, rounded to two decimal places.',
    example: 750,
  })
  outstandingAmount!: number;

  @ApiProperty({
    description: 'Full invoice amount, rounded to two decimal places.',
    example: 1000,
  })
  totalAmount!: number;

  @ApiProperty({
    description: 'Amount already paid, rounded to two decimal places.',
    example: 250,
  })
  paidAmount!: number;

  @ApiProperty({
    description: 'Identifier of the associated customer.',
    example: 'customer-id',
  })
  customerId!: string;

  @ApiProperty({
    description: 'Display name of the associated customer.',
    example: 'Client A',
  })
  customerName!: string;

  @ApiProperty({
    description: 'Identifier of the associated project.',
    example: 'project-id',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Display name of the associated project.',
    example: 'Alpha Construction',
  })
  projectName!: string;

  @ApiProperty({
    description:
      'Completed 24-hour periods since the due date; zero if no due date or not yet due.',
    minimum: 0,
    example: 5,
  })
  daysOverdue!: number;
}

/** Paginated list of currently overdue invoices. */
export class OverdueInvoiceReportResponseDto extends PaginationMetaDto {
  @ApiProperty({
    description: 'Overdue invoices matching the supplied filters.',
    type: [OverdueInvoiceItemDto],
  })
  items!: OverdueInvoiceItemDto[];
}
