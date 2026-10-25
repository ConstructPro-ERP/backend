import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateInvoicePdfDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Regenerate the PDF even if one already exists.',
  })
  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}
