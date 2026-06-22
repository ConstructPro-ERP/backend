import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum OutstandingInvoiceSortByDto {
  INVOICE_DATE = 'invoiceDate',
  DUE_DATE = 'dueDate',
  TOTAL_AMOUNT = 'totalAmount',
  PAID_AMOUNT = 'paidAmount',
  OUTSTANDING_AMOUNT = 'outstandingAmount',
  CREATED_AT = 'createdAt',
}

export enum SortOrderDto {
  ASC = 'asc',
  DESC = 'desc',
}

export class FinanceDateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class OutstandingInvoiceReportQueryDto extends FinanceDateRangeQueryDto {
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

  @ApiPropertyOptional({
    enum: OutstandingInvoiceSortByDto,
    default: OutstandingInvoiceSortByDto.DUE_DATE,
  })
  @IsOptional()
  @IsEnum(OutstandingInvoiceSortByDto)
  sortBy: OutstandingInvoiceSortByDto = OutstandingInvoiceSortByDto.DUE_DATE;

  @ApiPropertyOptional({ enum: SortOrderDto, default: SortOrderDto.ASC })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.ASC;
}
