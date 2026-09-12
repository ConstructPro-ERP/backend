import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Kandy Residential Complex - Phase 2' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({
    example: 'Kandy',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  location?: string | null;

  @ApiPropertyOptional({ example: '2026-10-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2027-04-30T00:00:00.000Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({
    example: 27500000,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number | null;

  @ApiPropertyOptional({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
