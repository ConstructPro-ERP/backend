import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum TaskSortField {
  CREATED_AT = 'createdAt',
  DUE_DATE = 'dueDate',
  TASK_NAME = 'taskName',
}

export enum TaskSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class TaskQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: TaskSortField,
    default: TaskSortField.CREATED_AT,
  })
  @IsOptional()
  @IsIn(Object.values(TaskSortField))
  sortBy?: TaskSortField = TaskSortField.CREATED_AT;

  @ApiPropertyOptional({
    enum: TaskSortOrder,
    default: TaskSortOrder.DESC,
  })
  @IsOptional()
  @IsIn(Object.values(TaskSortOrder))
  sortOrder?: TaskSortOrder = TaskSortOrder.DESC;
}
