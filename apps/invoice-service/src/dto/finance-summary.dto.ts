import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatusDto } from './invoice-status.dto';

export class ClientFinanceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  totalInvoicedAmount!: number;

  @ApiProperty()
  totalPaidAmount!: number;

  @ApiProperty()
  outstandingBalance!: number;

  @ApiProperty({ required: false, nullable: true })
  fromDate!: string | null;

  @ApiProperty({ required: false, nullable: true })
  toDate!: string | null;
}

export class ProjectFinanceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty()
  revenue!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  outstandingAmount!: number;

  @ApiProperty()
  expenseTotal!: number;

  @ApiProperty()
  estimatedProfit!: number;

  @ApiProperty({ required: false, nullable: true })
  fromDate!: string | null;

  @ApiProperty({ required: false, nullable: true })
  toDate!: string | null;
}

export class OutstandingInvoiceReportItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  projectName!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  invoiceDate!: Date;

  @ApiProperty({ required: false, nullable: true })
  dueDate!: Date | null;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  outstandingAmount!: number;

  @ApiProperty({ enum: InvoiceStatusDto })
  status!: InvoiceStatusDto;
}

export class OutstandingInvoiceReportDto {
  @ApiProperty({ type: [OutstandingInvoiceReportItemDto] })
  items!: OutstandingInvoiceReportItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  totalOutstandingAmount!: number;

  @ApiProperty({ required: false, nullable: true })
  fromDate!: string | null;

  @ApiProperty({ required: false, nullable: true })
  toDate!: string | null;
}
