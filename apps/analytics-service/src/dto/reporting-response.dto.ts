import { ApiProperty } from '@nestjs/swagger';
import {
  InvoiceStatus,
  MilestoneStatus,
  ProjectStatus,
} from '@prisma/client';
import { ActivityTypeDto } from './reporting-query.dto';

export class PaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

export class RecentActivityItemDto {
  @ApiProperty({ enum: ActivityTypeDto }) type!: ActivityTypeDto;
  @ApiProperty() entityId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ nullable: true }) relatedProjectId!: string | null;
  @ApiProperty({ nullable: true }) relatedProjectName!: string | null;
}

export class RecentActivityResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [RecentActivityItemDto] })
  items!: RecentActivityItemDto[];
}

export class ProjectMilestoneSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() milestoneName!: string;
  @ApiProperty({ enum: MilestoneStatus }) status!: MilestoneStatus;
  @ApiProperty({ nullable: true }) dueDate!: Date | null;
  @ApiProperty() taskCount!: number;
  @ApiProperty() completedTaskCount!: number;
  @ApiProperty() completionPercentage!: number;
}

export class ProjectCompletionItemDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty({ enum: ProjectStatus }) status!: ProjectStatus;
  @ApiProperty() startDate!: Date;
  @ApiProperty({ nullable: true }) endDate!: Date | null;
  @ApiProperty() budget!: number | null;
  @ApiProperty() milestoneCount!: number;
  @ApiProperty() completedMilestoneCount!: number;
  @ApiProperty() completionPercentage!: number;
  @ApiProperty({ type: [ProjectMilestoneSummaryDto] })
  milestones!: ProjectMilestoneSummaryDto[];
}

export class ProjectCompletionReportResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [ProjectCompletionItemDto] })
  items!: ProjectCompletionItemDto[];
}

export class ExpenseReportItemDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() totalExpense!: number;
  @ApiProperty() expenseCount!: number;
  @ApiProperty({ nullable: true }) firstExpenseAt!: Date | null;
  @ApiProperty({ nullable: true }) lastExpenseAt!: Date | null;
}

export class ExpenseReportSummaryDto {
  @ApiProperty() totalExpense!: number;
  @ApiProperty() totalExpenseCount!: number;
  @ApiProperty({ nullable: true }) fromDate!: string | null;
  @ApiProperty({ nullable: true }) toDate!: string | null;
}

export class ExpenseReportResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [ExpenseReportItemDto] })
  items!: ExpenseReportItemDto[];

  @ApiProperty({ type: ExpenseReportSummaryDto })
  summary!: ExpenseReportSummaryDto;
}

export class OverdueInvoiceItemDto {
  @ApiProperty() invoiceId!: string;
  @ApiProperty({ nullable: true }) invoiceNumber!: string | null;
  @ApiProperty({ enum: InvoiceStatus }) status!: InvoiceStatus;
  @ApiProperty() invoiceDate!: Date;
  @ApiProperty({ nullable: true }) dueDate!: Date | null;
  @ApiProperty() outstandingAmount!: number;
  @ApiProperty() totalAmount!: number;
  @ApiProperty() paidAmount!: number;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() daysOverdue!: number;
}

export class OverdueInvoiceReportResponseDto extends PaginationMetaDto {
  @ApiProperty({ type: [OverdueInvoiceItemDto] })
  items!: OverdueInvoiceItemDto[];
}
