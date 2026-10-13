import { PickType } from '@nestjs/swagger';
import { TaskQueryDto } from './task-query.dto';

export class TaskAssigneeQueryDto extends PickType(TaskQueryDto, [
  'page',
  'limit',
] as const) {}
