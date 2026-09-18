import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum ProjectSortField {
  CREATED_AT = 'createdAt',
  PROJECT_NAME = 'projectName',
  START_DATE = 'startDate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ProjectQueryDto {
  @ApiPropertyOptional({ example: 'Kandy' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 10;

  @ApiPropertyOptional({
    enum: ProjectSortField,
    default: ProjectSortField.CREATED_AT,
  })
  @IsOptional()
  @IsIn(Object.values(ProjectSortField))
  sortBy: ProjectSortField = ProjectSortField.CREATED_AT;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsIn(Object.values(SortOrder))
  sortOrder: SortOrder = SortOrder.DESC;
}
