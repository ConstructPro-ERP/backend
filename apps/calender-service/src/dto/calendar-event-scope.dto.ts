import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CalendarEventScopeDto {
  @ApiPropertyOptional({ description: 'Limit events to this project' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
