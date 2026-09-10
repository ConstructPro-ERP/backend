import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateLeadDto {
  @ApiPropertyOptional({ example: 'John Silva' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: '+94771234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sales Manager user ID' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
