import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignProjectManagerDto {
  @ApiProperty({
    example: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
  })
  @IsUUID()
  projectManagerId!: string;
}
