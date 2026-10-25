import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status!: LeadStatus;
}
