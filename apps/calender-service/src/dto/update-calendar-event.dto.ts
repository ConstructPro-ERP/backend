import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateCalendarEventDto {
  @ApiPropertyOptional({
    example: 'Updated Site Progress Meeting',
  })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({
    example: '2026-10-10T10:00:00+05:30',
  })
  @IsDateString()
  @IsOptional()
  startDateTime?: string;

  @ApiPropertyOptional({
    example: '2026-10-10T11:00:00+05:30',
  })
  @IsDateString()
  @IsOptional()
  endDateTime?: string;

  @ApiPropertyOptional({
    example: 'Asia/Colombo',
  })
  @IsString()
  @IsOptional()
  timeZone?: string;
}
