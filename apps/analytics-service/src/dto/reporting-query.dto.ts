import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MilestoneStatus, ProjectStatus } from '@prisma/client';

/** Direction used by Analytics report sorting. */
export enum SortOrderDto {
  ASC = 'asc',
  DESC = 'desc',
}

/** Supported entity categories in the recent-activity feed. */
export enum ActivityTypeDto {
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  PROJECT = 'project',
  LEAD = 'lead',
  QUOTATION = 'quotation',
  DOCUMENT = 'document',
  MILESTONE = 'milestone',
}

/** Database-backed sortable project fields for the completion report. */
export enum ProjectCompletionSortByDto {
  PROJECT_NAME = 'projectName',
  STATUS = 'status',
  START_DATE = 'startDate',
  END_DATE = 'endDate',
  CREATED_AT = 'createdAt',
}

/** Available sort fields for the grouped expense report. */
export enum ExpenseReportSortByDto {
  PROJECT_NAME = 'projectName',
  TOTAL_EXPENSE = 'totalExpense',
  EXPENSE_COUNT = 'expenseCount',
  LAST_EXPENSE_AT = 'lastExpenseAt',
}

/** Available sort fields for the overdue-invoice report. */
export enum OverdueInvoiceSortByDto {
  DUE_DATE = 'dueDate',
  OUTSTANDING_AMOUNT = 'outstandingAmount',
  INVOICE_DATE = 'invoiceDate',
  CREATED_AT = 'createdAt',
}

/** Shared, validated one-based report pagination parameters. */
class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Maximum number of results per page.',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

/** Shared date filters for paginated reports. */
class DateRangeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Include results on or after this date.',
    example: '2026-06-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Include results on or before this date.',
    example: '2026-06-30',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

/** Recent invoice, payment, project, lead, quotation, document and milestone activity. */
export class RecentActivityQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    enum: ActivityTypeDto,
    isArray: true,
    description:
      'Optional activity-category filter. When omitted or empty, all supported categories are included.',
    example: [ActivityTypeDto.INVOICE, ActivityTypeDto.PROJECT],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ActivityTypeDto, { each: true })
  @Type(() => String)
  activityTypes?: ActivityTypeDto[];
}

/** Paginated project completion report with optional manager/status filters. */
export class ProjectCompletionReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description:
      'Limit the report to projects assigned to this project manager.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({
    description: 'Filter projects by their lifecycle status.',
    enum: ProjectStatus,
    example: ProjectStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({
    description: 'Project field used to order report rows.',
    enum: ProjectCompletionSortByDto,
    default: ProjectCompletionSortByDto.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(ProjectCompletionSortByDto)
  sortBy: ProjectCompletionSortByDto = ProjectCompletionSortByDto.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Sort direction for the selected project field.',
    enum: SortOrderDto,
    default: SortOrderDto.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.DESC;
}

/** Expense totals grouped by project, optionally narrowed by project/recorder. */
export class ExpenseReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Limit expenses to one project.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Limit expenses to records entered by this user.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  recordedById?: string;

  @ApiPropertyOptional({
    description: 'Grouped expense-report field used for sorting.',
    enum: ExpenseReportSortByDto,
    default: ExpenseReportSortByDto.LAST_EXPENSE_AT,
  })
  @IsOptional()
  @IsEnum(ExpenseReportSortByDto)
  sortBy: ExpenseReportSortByDto = ExpenseReportSortByDto.LAST_EXPENSE_AT;

  @ApiPropertyOptional({
    description: 'Sort direction for the selected expense-report field.',
    enum: SortOrderDto,
    default: SortOrderDto.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.DESC;
}

/** Paginated list of OVERDUE invoices with optional project/customer filters. */
export class OverdueInvoiceReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    description: 'Limit overdue invoices to one project.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Limit overdue invoices to one customer.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Invoice field used to order report rows.',
    enum: OverdueInvoiceSortByDto,
    default: OverdueInvoiceSortByDto.DUE_DATE,
  })
  @IsOptional()
  @IsEnum(OverdueInvoiceSortByDto)
  sortBy: OverdueInvoiceSortByDto = OverdueInvoiceSortByDto.DUE_DATE;

  @ApiPropertyOptional({
    description: 'Sort direction for the selected invoice field.',
    enum: SortOrderDto,
    default: SortOrderDto.ASC,
  })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.ASC;
}

/** Optional filter by current milestone lifecycle status. */
export class MilestoneStatusFilterDto {
  @ApiPropertyOptional({
    description: 'Include only milestones with this status.',
    enum: MilestoneStatus,
  })
  @IsOptional()
  @IsIn(Object.values(MilestoneStatus))
  status?: MilestoneStatus;
}
