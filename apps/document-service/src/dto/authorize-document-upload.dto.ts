import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import { UploadDocumentDto } from './upload-document.dto';

export class AuthorizeDocumentUploadDto extends UploadDocumentDto {
  @ApiProperty({
    description: 'Original filename including extension',
    example: 'structural-plan.pdf',
    maxLength: 255,
  })
  @IsString()
  @Matches(/\S/, { message: 'fileName cannot be blank' })
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    description: 'Declared file MIME type',
    example: 'application/pdf',
    maxLength: 150,
  })
  @IsString()
  @Matches(/\S/, { message: 'mimeType cannot be blank' })
  @MaxLength(150)
  mimeType!: string;

  @ApiProperty({
    description: 'Declared file size in bytes',
    example: 10485760,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  fileSize!: number;
}
