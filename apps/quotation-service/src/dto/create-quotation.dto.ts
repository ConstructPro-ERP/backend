import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuotationStatus } from '@prisma/client';

export class CreateQuotationItemDto {
  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateQuotationDto {
  @IsUUID()
  leadId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items!: CreateQuotationItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;
}
