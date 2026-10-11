import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({
    description: 'Existing active document category UUID',
    format: 'uuid',
  })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    example: 'Approved architectural drawing',
    maxLength: 1000,
    nullable: true,
  })
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(1000)
  description?: string | null;
}
