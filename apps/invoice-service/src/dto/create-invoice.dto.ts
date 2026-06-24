import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EditableInvoiceStatusDto } from './invoice-status.dto';

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ format: 'uuid', description: 'Existing Customer ID' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: '2026-06-22' })
  @IsDateString()
  invoiceDate!: string;

  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ example: 125000.5, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: EditableInvoiceStatusDto, default: 'DRAFT' })
  @IsOptional()
  @IsEnum(EditableInvoiceStatusDto)
  status?: EditableInvoiceStatusDto;
}

export class CreateProjectInvoiceDto {
  @ApiProperty({ format: 'uuid', description: 'Existing Customer ID' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: '2026-06-22' })
  @IsDateString()
  invoiceDate!: string;

  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ example: 125000.5, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ enum: EditableInvoiceStatusDto, default: 'DRAFT' })
  @IsOptional()
  @IsEnum(EditableInvoiceStatusDto)
  status?: EditableInvoiceStatusDto;
}
