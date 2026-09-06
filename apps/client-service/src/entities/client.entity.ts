import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  leadId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
