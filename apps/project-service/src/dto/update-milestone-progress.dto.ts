import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MilestoneStatus } from '@prisma/client';
import { IsEnum, IsNumber, Max, Min, ValidateIf } from 'class-validator';

export class UpdateMilestoneProgressDto {
  @ApiProperty({
    example: 75,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100)
  progressPercentage!: number;

  @ApiPropertyOptional({ enum: MilestoneStatus })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;
}
