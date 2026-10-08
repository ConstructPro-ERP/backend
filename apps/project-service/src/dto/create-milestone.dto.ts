import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Foundation Construction' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'milestoneName cannot be blank' })
  milestoneName!: string;

  @ApiPropertyOptional({
    example: 'Complete excavation and foundation work',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  dueDate?: string | null;

  @ApiProperty({
    example: 5,
    description: 'Relative milestone weight from 1 to 10',
    minimum: 1,
    maximum: 10,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  weight!: number;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    maximum: 100,
    default: 0,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @ApiPropertyOptional({
    enum: MilestoneStatus,
    default: MilestoneStatus.PENDING,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;
}
