import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { AssignTaskDto } from '../../../task-service/src/dto/assign-task.dto';
import { CreateTaskDto } from '../../../task-service/src/dto/create-task.dto';
import { TaskQueryDto } from '../../../task-service/src/dto/task-query.dto';
import { UpdateTaskStatusDto } from '../../../task-service/src/dto/update-task-status.dto';
import { UpdateTaskDto } from '../../../task-service/src/dto/update-task.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const TASK_READ_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'];
const TASK_WRITE_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: DownstreamError;
  };
}

@ApiTags('Tasks')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Invalid task request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient project permissions' })
@ApiNotFoundResponse({ description: 'Project or task not found' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...TASK_READ_ROLES)
@Controller()
export class TasksGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('tasks')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a project or milestone task' })
  @ApiCreatedResponse({ description: 'Task created successfully' })
  create(@Body() body: CreateTaskDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/tasks'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List and filter tasks' })
  @ApiOkResponse({ description: 'Paginated list of tasks' })
  findAll(@Query() query: TaskQueryDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url('/tasks'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('projects/:projectId/tasks')
  @ApiOperation({ summary: 'List tasks for a project' })
  @ApiOkResponse({ description: 'Paginated project tasks' })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: TaskQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/projects/${projectId}/tasks`), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'Get task details' })
  @ApiOkResponse({ description: 'Task details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/tasks/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('tasks/:id')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Update task metadata' })
  @ApiOkResponse({ description: 'Task updated successfully' })
  @ApiConflictResponse({
    description: 'Task modification is not allowed',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/tasks/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('tasks/:id/status')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Update task status' })
  @ApiOkResponse({ description: 'Task status updated successfully' })
  @ApiConflictResponse({
    description: 'Task modification is not allowed',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/tasks/${id}/status`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('tasks/:id/assign')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Assign or reassign a task' })
  @ApiOkResponse({ description: 'Task assigned successfully' })
  @ApiConflictResponse({
    description: 'Task modification is not allowed',
  })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/tasks/${id}/assign`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete('tasks/:id')
  @Roles(...TASK_WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiOkResponse({ description: 'Task deleted successfully' })
  @ApiConflictResponse({
    description: 'Task modification is not allowed',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/tasks/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.TASK_SERVICE_URL ?? 'http://localhost:3004';

    return `${base.replace(/\/$/, '')}${path}`;
  }

  private forwardHeaders(req: AuthenticatedRequest) {
    // Never trust an x-user-id supplied directly by the client.
    const actorId = req.user?.id ?? req.user?.sub;

    return {
      authorization: req.headers.authorization,
      ...(actorId ? { 'x-user-id': actorId } : {}),
    };
  }

  private async forward(
    call: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    try {
      return (await firstValueFrom(call())).data;
    } catch (error: unknown) {
      const downstream =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as AxiosErrorShape).response
          : undefined;

      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }

      throw new HttpException(
        {
          code: 'TASK_SERVICE_UNAVAILABLE',
          message: 'Task service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
