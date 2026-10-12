import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class CreateDocumentCategoryDto {
  @ApiProperty({
    example: 'Architectural Drawings',
    maxLength: 100,
  })
  @IsString()
  @Matches(/\S/, { message: 'categoryName cannot be blank' })
  @MaxLength(100)
  categoryName!: string;

  @ApiPropertyOptional({
    example: 'Architectural plans and approved drawings',
    nullable: true,
    maxLength: 500,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(500)
  description?: string | null;
}
