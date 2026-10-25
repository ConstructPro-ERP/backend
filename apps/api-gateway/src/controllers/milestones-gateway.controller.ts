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
import { CreateMilestoneDto } from '../../../project-service/src/dto/create-milestone.dto';
import { UpdateMilestoneDto } from '../../../project-service/src/dto/update-milestone.dto';
import { UpdateMilestoneProgressDto } from '../../../project-service/src/dto/update-milestone-progress.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const MILESTONE_READ_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'];
const MILESTONE_WRITE_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

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

@ApiTags('Milestones')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Invalid milestone request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient project permissions' })
@ApiNotFoundResponse({ description: 'Project or milestone not found' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...MILESTONE_READ_ROLES)
@Controller()
export class MilestonesGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('projects/:projectId/milestones')
  @Roles(...MILESTONE_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a project milestone' })
  @ApiCreatedResponse({ description: 'Milestone created successfully' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateMilestoneDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post(
        this.url(`/projects/${projectId}/milestones`),
        body,
        {
          headers: this.forwardHeaders(req),
        },
      ),
    );
  }

  @Get('projects/:projectId/milestones')
  @ApiOperation({ summary: 'List milestones for a project' })
  @ApiOkResponse({ description: 'Project milestones' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/projects/${projectId}/milestones`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('milestones/:id')
  @ApiOperation({ summary: 'Get a milestone by ID' })
  @ApiOkResponse({ description: 'Milestone details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/milestones/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('milestones/:id')
  @Roles(...MILESTONE_WRITE_ROLES)
  @ApiOperation({ summary: 'Update milestone details and weight' })
  @ApiOkResponse({ description: 'Milestone updated successfully' })
  @ApiConflictResponse({
    description: 'Milestone modification not allowed',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMilestoneDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/milestones/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('milestones/:id/progress')
  @Roles(...MILESTONE_WRITE_ROLES)
  @ApiOperation({ summary: 'Update milestone progress and status' })
  @ApiOkResponse({
    description: 'Milestone progress updated successfully',
  })
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMilestoneProgressDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/milestones/${id}/progress`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete('milestones/:id')
  @Roles(...MILESTONE_WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a milestone' })
  @ApiOkResponse({ description: 'Milestone deleted successfully' })
  @ApiConflictResponse({
    description: 'Milestone in use or modification not allowed',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/milestones/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3003';
    return `${base}${path}`;
  }

  private forwardHeaders(req: AuthenticatedRequest) {
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
      const downstream = (error as AxiosErrorShape).response;

      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }

      throw new HttpException(
        {
          code: 'PROJECT_SERVICE_UNAVAILABLE',
          message: 'Project service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
