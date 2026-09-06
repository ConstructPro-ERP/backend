import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'John Silva' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lead to link this client to',
  })
  @IsOptional()
  @IsUUID()
  leadId?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional({ example: 'John R. Silva' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;
}
