import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

export class AssignTaskDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Active user UUID, or null to clear the assignment',
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDefined()
  @IsUUID()
  assignedToId!: string | null;
}
