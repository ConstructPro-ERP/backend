import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  Max,
  ValidateIf,
} from 'class-validator';

export class UpdateMilestoneDto {
  @ApiPropertyOptional({ example: 'Foundation Construction - Revised' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'milestoneName cannot be blank' })
  milestoneName?: string;

  @ApiPropertyOptional({
    example: 'Updated foundation construction scope',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: '2027-01-15T00:00:00.000Z',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({
    example: 45,
    description: 'Milestone weight must be greater than 0 and at most 100',
    maximum: 100,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  @Max(100)
  weight?: number;
}
