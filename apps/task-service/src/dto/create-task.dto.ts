import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  milestoneId?: string | null;

  @ApiPropertyOptional({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsUUID()
  assignedToId?: string | null;

  @ApiProperty({ example: 'Prepare foundation materials' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'taskName cannot be blank' })
  taskName!: string;

  @ApiPropertyOptional({
    example: 'Arrange materials before foundation construction',
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

  @ApiPropertyOptional({
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
