import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
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
}
