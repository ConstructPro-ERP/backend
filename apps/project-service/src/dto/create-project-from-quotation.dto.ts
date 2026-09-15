import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateProjectFromQuotationDto {
  @ApiProperty()
  @IsUUID()
  quotationId!: string;

  @ApiProperty()
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional({
    description: 'Existing project to attach this quotation to',
  })
  @IsOptional()
  @IsUUID()
  targetProjectId?: string;

  @ApiPropertyOptional({ example: 'Fernando Residence' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ example: 'Colombo' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2027-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @ApiPropertyOptional({ example: 10000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;
}
