import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateDocumentCategoryDto {
  @ApiPropertyOptional({
    example: 'Approved Drawings',
    maxLength: 100,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'categoryName cannot be blank' })
  @MaxLength(100)
  categoryName?: string;

  @ApiPropertyOptional({
    example: 'Updated category description',
    nullable: true,
    maxLength: 500,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Enable or disable this category',
    type: Boolean,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
