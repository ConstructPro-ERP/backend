import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignLeadDto {
  @ApiProperty({ format: 'uuid', description: 'Sales Manager user ID' })
  @IsUUID()
  assignedToId!: string;
}
