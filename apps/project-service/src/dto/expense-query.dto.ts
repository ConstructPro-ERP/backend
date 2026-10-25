import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum ExpenseSortField {
  EXPENSE_DATE = 'expenseDate',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export enum ExpenseSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ExpenseQueryDto {
  @ApiPropertyOptional({
    example: 'MATERIAL',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'category cannot be blank' })
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Inclusive expense date range start',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Inclusive expense date range end',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  toDate?: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: ExpenseSortField,
    default: ExpenseSortField.EXPENSE_DATE,
  })
  @IsOptional()
  @IsIn(Object.values(ExpenseSortField))
  sortBy?: ExpenseSortField = ExpenseSortField.EXPENSE_DATE;

  @ApiPropertyOptional({
    enum: ExpenseSortOrder,
    default: ExpenseSortOrder.DESC,
  })
  @IsOptional()
  @IsIn(Object.values(ExpenseSortOrder))
  sortOrder?: ExpenseSortOrder = ExpenseSortOrder.DESC;
}
