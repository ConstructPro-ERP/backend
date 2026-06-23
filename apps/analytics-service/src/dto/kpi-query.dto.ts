import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class KpiQueryDto {
  @ApiPropertyOptional({
    description: 'Inclusive start date for KPI aggregation',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Inclusive end date for KPI aggregation',
    example: '2026-06-30',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
