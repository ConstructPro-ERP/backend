import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatusDto } from './invoice-status.dto';

export enum InvoiceSortByDto {
  INVOICE_DATE = 'invoiceDate',
  DUE_DATE = 'dueDate',
  TOTAL_AMOUNT = 'totalAmount',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrderDto {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListInvoicesQueryDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: InvoiceStatusDto })
  @IsOptional()
  @IsEnum(InvoiceStatusDto)
  status?: InvoiceStatusDto;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ enum: InvoiceSortByDto, default: 'createdAt' })
  @IsOptional()
  @IsEnum(InvoiceSortByDto)
  sortBy: InvoiceSortByDto = InvoiceSortByDto.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrderDto, default: 'desc' })
  @IsOptional()
  @IsEnum(SortOrderDto)
  sortOrder: SortOrderDto = SortOrderDto.DESC;
}
