import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLeadContactDto {
  @ApiProperty({
    example: 'primary_phone',
    description: 'Label for this contact entry (e.g. primary_phone, whatsapp)',
  })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ example: '+94771234567' })
  @IsString()
  @IsNotEmpty()
  value!: string;
}

export class UpdateLeadContactDto {
  @ApiProperty({ example: 'secondary_email' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ example: 'john.alt@example.com' })
  @IsString()
  @IsNotEmpty()
  value!: string;
}
