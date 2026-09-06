import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';

export class LeadNoteEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  leadId!: string;

  @ApiProperty()
  content!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  authorId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class LeadContactEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  leadId!: string;

  @ApiProperty({ example: 'primary_phone' })
  label!: string;

  @ApiProperty({ example: '+94771234567' })
  value!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class LeadEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  customerName!: string;

  @ApiPropertyOptional()
  phone!: string | null;

  @ApiPropertyOptional()
  email!: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  assignedToId!: string | null;

  @ApiProperty({ enum: LeadStatus })
  status!: LeadStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: () => LeadNoteEntity, isArray: true })
  notes?: LeadNoteEntity[];

  @ApiPropertyOptional({ type: () => LeadContactEntity, isArray: true })
  contacts?: LeadContactEntity[];
}
