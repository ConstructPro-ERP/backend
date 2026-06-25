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
import { InvoiceStatus, MilestoneStatus, ProjectStatus } from '@prisma/client';

export enum SortOrderDto {
  ASC = 'asc',
  DESC = 'desc',
}

export enum ActivityTypeDto {
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  PROJECT = 'project',
  LEAD = 'lead',
  QUOTATION = 'quotation',
  DOCUMENT = 'document',
  MILESTONE = 'milestone',
}

export enum ProjectCompletionSortByDto {
  PROJECT_NAME = 'projectName',
  STATUS = 'status',
  START_DATE = 'startDate',
  END_DATE = 'endDate',
  CREATED_AT = 'createdAt',
}

export enum ExpenseReportSortByDto {
  PROJECT_NAME = 'projectName',
  TOTAL_EXPENSE = 'totalExpense',
  EXPENSE_COUNT = 'expenseCount',
  LAST_EXPENSE_AT = 'lastExpenseAt',
}

export enum OverdueInvoiceSortByDto {
  DUE_DATE = 'dueDate',
  OUTSTANDING_AMOUNT = 'outstandingAmount',
  INVOICE_DATE = 'invoiceDate',
  CREATED_AT = 'createdAt',
}

class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

class DateRangeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class RecentActivityQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({
    enum: ActivityTypeDto,
    isArray: true,
    description: 'Restrict activity feed to one or more activity types',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ActivityTypeDto, { each: true })
  @Type(() => String)
  activityTypes?: ActivityTypeDto[];
}

export class ProjectCompletionReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({
    enum: ProjectCompletionSortByDto,
    default: ProjectCompletionSortByDto.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(ProjectCompletionSortByDto)
  sortBy: ProjectCompletionSortByDto = ProjectCompletionSortByDto.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrderDto, default: SortOrderDto.DESC })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.DESC;
}

export class ExpenseReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  recordedById?: string;

  @ApiPropertyOptional({
    enum: ExpenseReportSortByDto,
    default: ExpenseReportSortByDto.LAST_EXPENSE_AT,
  })
  @IsOptional()
  @IsEnum(ExpenseReportSortByDto)
  sortBy: ExpenseReportSortByDto = ExpenseReportSortByDto.LAST_EXPENSE_AT;

  @ApiPropertyOptional({ enum: SortOrderDto, default: SortOrderDto.DESC })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.DESC;
}

export class OverdueInvoiceReportQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    enum: OverdueInvoiceSortByDto,
    default: OverdueInvoiceSortByDto.DUE_DATE,
  })
  @IsOptional()
  @IsEnum(OverdueInvoiceSortByDto)
  sortBy: OverdueInvoiceSortByDto = OverdueInvoiceSortByDto.DUE_DATE;

  @ApiPropertyOptional({ enum: SortOrderDto, default: SortOrderDto.ASC })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.ASC;
}

export class MilestoneStatusFilterDto {
  @ApiPropertyOptional({ enum: MilestoneStatus })
  @IsOptional()
  @IsIn(Object.values(MilestoneStatus))
  status?: MilestoneStatus;
}
