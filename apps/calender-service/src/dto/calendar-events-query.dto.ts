import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CalendarEventScopeDto } from './calendar-event-scope.dto';

export class CalendarEventsQueryDto extends CalendarEventScopeDto {
  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00+05:30',
  })
  @IsDateString()
  @IsOptional()
  timeMin?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59+05:30',
  })
  @IsDateString()
  @IsOptional()
  timeMax?: string;

  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxResults?: number;
}
