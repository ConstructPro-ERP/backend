import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskService } from './task.service';

@ApiTags('Tasks')
@ApiBadRequestResponse({ description: 'Invalid task request' })
@ApiUnauthorizedResponse({
  description: 'Authenticated user is required',
})
@ApiForbiddenResponse({
  description: 'Insufficient project permissions',
})
@Controller()
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Get('tasks/health')
  @ApiOperation({ summary: 'Check task service health' })
  @ApiOkResponse({ description: 'Task service is available' })
  getHealth() {
    return this.tasks.getHealth();
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a project or milestone task' })
  @ApiCreatedResponse({ description: 'Task created successfully' })
  @ApiNotFoundResponse({
    description: 'Project or milestone not found',
  })
  @ApiConflictResponse({
    description: 'Project does not allow task modifications',
  })
  create(@Body() dto: CreateTaskDto, @Headers('x-user-id') actorId?: string) {
    return this.tasks.create(dto, actorId);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List and filter tasks' })
  @ApiOkResponse({ description: 'Paginated list of tasks' })
  findAll(
    @Query() query: TaskQueryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.findAll(query, actorId);
  }

  @Get('projects/:projectId/tasks')
  @ApiOperation({ summary: 'List tasks belonging to a project' })
  @ApiOkResponse({ description: 'Paginated project tasks' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: TaskQueryDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.findByProject(projectId, query, actorId);
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get task details' })
  @ApiOkResponse({ description: 'Task details' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.findOne(id, actorId);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update task metadata' })
  @ApiOkResponse({ description: 'Task updated successfully' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({
    description: 'Project does not allow task modifications',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.update(id, dto, actorId);
  }

  @Patch('tasks/:id/status')
  @ApiOperation({ summary: 'Update task status' })
  @ApiOkResponse({ description: 'Task status updated successfully' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({
    description: 'Project does not allow task modifications',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.updateStatus(id, dto, actorId);
  }

  @Patch('tasks/:id/assign')
  @ApiOperation({ summary: 'Assign or reassign a task' })
  @ApiOkResponse({ description: 'Task assigned successfully' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({
    description: 'Project does not allow task modifications',
  })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.assign(id, dto, actorId);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiOkResponse({ description: 'Task deleted successfully' })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiConflictResponse({
    description: 'Project does not allow task modifications',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.tasks.remove(id, actorId);
  }
}
