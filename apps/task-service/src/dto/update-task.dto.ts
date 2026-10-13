import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    example: 'Prepare foundation materials - Revised',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'taskName cannot be blank' })
  taskName?: string;

  @ApiPropertyOptional({
    example: 'Updated materials and delivery requirements',
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
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  milestoneId?: string | null;
}
