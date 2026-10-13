import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EXPENSE_AMOUNT_PATTERN } from './create-expense.dto';

export class UpdateExpenseDto {
  @ApiPropertyOptional({
    example: '15000.50',
    type: String,
    description: 'Positive decimal string with at most 2 decimal places',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(EXPENSE_AMOUNT_PATTERN, {
    message:
      'amount must be a positive decimal string with up to 10 integer digits and 2 decimal places',
  })
  amount?: string;

  @ApiPropertyOptional({
    example: 'LABOUR',
    nullable: true,
    maxLength: 100,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'category cannot be blank' })
  @MaxLength(100)
  category?: string | null;

  @ApiPropertyOptional({
    example: 'Updated expense description',
    nullable: true,
    maxLength: 1000,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({
    example: '2026-10-11T00:00:00.000Z',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsDateString({ strict: true })
  expenseDate?: string;
}
