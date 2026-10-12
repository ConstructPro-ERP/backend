import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum DocumentSortField {
  CREATED_AT = 'createdAt',
  FILE_NAME = 'fileName',
}

export enum DocumentSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class DocumentQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Search by document filename',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'search cannot be blank' })
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: DocumentSortField,
    default: DocumentSortField.CREATED_AT,
  })
  @IsOptional()
  @IsIn(Object.values(DocumentSortField))
  sortBy?: DocumentSortField = DocumentSortField.CREATED_AT;

  @ApiPropertyOptional({
    enum: DocumentSortOrder,
    default: DocumentSortOrder.DESC,
  })
  @IsOptional()
  @IsIn(Object.values(DocumentSortOrder))
  sortOrder?: DocumentSortOrder = DocumentSortOrder.DESC;
}
