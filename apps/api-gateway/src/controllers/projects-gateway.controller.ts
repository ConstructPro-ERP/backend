import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import { AssignProjectManagerDto } from '../../../project-service/src/dto/assign-project-manager.dto';
import { CreateProjectDto } from '../../../project-service/src/dto/create-project.dto';
import { ProjectQueryDto } from '../../../project-service/src/dto/project-query.dto';
import { UpdateProjectStatusDto } from '../../../project-service/src/dto/project-status.dto';
import { UpdateProjectDto } from '../../../project-service/src/dto/update-project.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const PROJECT_READ_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'ACCOUNTANT'];

/*
 * Assigned-Project-Manager ownership checks are not implemented in
 * project-service yet. Keep project mutations Admin-only until that
 * authorization rule is implemented in the service layer.
 */
const PROJECT_WRITE_ROLES = ['ADMIN'];

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

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PROJECT_READ_ROLES)
@Controller('projects')
export class ProjectsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post()
  @Roles(...PROJECT_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a standalone project' })
  @ApiCreatedResponse({ description: 'Project created successfully' })
  create(@Body() body: CreateProjectDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/projects'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List projects' })
  @ApiOkResponse({ description: 'Paginated list of projects' })
  findAll(@Query() query: ProjectQueryDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url('/projects'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiOkResponse({ description: 'Project details' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/projects/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id')
  @Roles(...PROJECT_WRITE_ROLES)
  @ApiOperation({ summary: 'Update a project' })
  @ApiOkResponse({ description: 'Project updated successfully' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateProjectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/projects/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id/status')
  @Roles(...PROJECT_WRITE_ROLES)
  @ApiOperation({ summary: 'Update project status' })
  @ApiOkResponse({ description: 'Project status updated successfully' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateProjectStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/projects/${id}/status`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id/manager')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Assign a project manager' })
  @ApiOkResponse({ description: 'Project manager assigned successfully' })
  assignManager(
    @Param('id') id: string,
    @Body() body: AssignProjectManagerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/projects/${id}/manager`), body, {
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
