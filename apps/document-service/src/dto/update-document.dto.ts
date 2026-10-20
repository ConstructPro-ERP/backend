import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({
    example: 'Approved Structural Plan.pdf',
    maxLength: 255,
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'fileName cannot be blank' })
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Existing active document category UUID',
    format: 'uuid',
  })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'Final approved drawing',
    maxLength: 1000,
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(1000)
  description?: string | null;
}
