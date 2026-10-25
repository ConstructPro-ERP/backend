import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkClientPortalUserDto {
  @ApiProperty({
    description: 'Existing user account to link to this Customer',
    format: 'uuid',
  })
  @IsUUID()
  userId!: string;
}
