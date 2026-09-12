import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Kandy Residential Complex' })
  @IsString()
  @IsNotEmpty()
  projectName!: string;

  @ApiPropertyOptional({ example: 'Kandy' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ example: '2027-03-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 25000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiProperty({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @IsUUID()
  projectManagerId!: string;

  @ApiPropertyOptional({
    enum: ProjectStatus,
    default: ProjectStatus.PLANNING,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
