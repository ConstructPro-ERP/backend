import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCalendarEventDto {
  @ApiProperty({
    example: 'Site Progress Meeting',
  })
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @ApiPropertyOptional({
    example: 'Review the current construction progress.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'Colombo Site Office',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    example: '2026-10-10T09:00:00+05:30',
  })
  @IsDateString()
  startDateTime!: string;

  @ApiProperty({
    example: '2026-10-10T10:00:00+05:30',
  })
  @IsDateString()
  endDateTime!: string;

  @ApiPropertyOptional({
    example: 'Asia/Colombo',
  })
  @IsString()
  @IsOptional()
  timeZone?: string;
}
