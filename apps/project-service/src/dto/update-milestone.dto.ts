import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
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
    example: 5,
    description: 'Relative milestone weight from 1 to 10',
    minimum: 1,
    maximum: 10,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;
}
