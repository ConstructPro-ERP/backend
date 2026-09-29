import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateQuotationItemDto } from './create-quotation.dto';

export class UpdateQuotationDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuotationItemDto)
  items?: CreateQuotationItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
