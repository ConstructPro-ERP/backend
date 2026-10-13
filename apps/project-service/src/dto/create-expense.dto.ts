import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Positive Decimal(12,2): up to 10 integer and 2 fractional digits.
export const EXPENSE_AMOUNT_PATTERN =
  /^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;

export class CreateExpenseDto {
  @ApiProperty({
    example: '12500.75',
    type: String,
    description: 'Positive decimal string with at most 2 decimal places',
  })
  @IsString()
  @Matches(EXPENSE_AMOUNT_PATTERN, {
    message:
      'amount must be a positive decimal string with up to 10 integer digits and 2 decimal places',
  })
  amount!: string;

  @ApiPropertyOptional({
    example: 'MATERIAL',
    nullable: true,
    maxLength: 100,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'category cannot be blank' })
  @MaxLength(100)
  category?: string | null;

  @ApiPropertyOptional({
    example: 'Purchase of foundation construction materials',
    nullable: true,
    maxLength: 1000,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({
    example: '2026-10-10T00:00:00.000Z',
    description: 'Date when the expense occurred',
  })
  @IsDateString({ strict: true })
  expenseDate!: string;
}
