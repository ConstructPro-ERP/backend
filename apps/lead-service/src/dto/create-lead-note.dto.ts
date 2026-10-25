import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLeadNoteDto {
  @ApiProperty({ example: 'Spoke with client — very interested in package B.' })
  @IsString()
  @IsNotEmpty()
  content!: string;
}
