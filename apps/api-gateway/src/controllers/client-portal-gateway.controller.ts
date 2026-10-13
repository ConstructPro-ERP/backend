import { HttpService } from '@nestjs/axios';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';
import { ClientPortalPageQueryDto } from '../../../client-service/src/dto/client-portal-page-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

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

@ApiTags('Client Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT_PORTAL_USER')
@Controller('client-portal')
export class ClientPortalGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Get('projects')
  @ApiOperation({ summary: 'List my projects' })
  @ApiOkResponse({ description: 'Paginated client projects' })
  findProjects(
    @Query() query: ClientPortalPageQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forwardGet('/projects', req, query);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'View my project details and progress' })
  @ApiOkResponse({ description: 'Client project details' })
  findProject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forwardGet(`/projects/${id}`, req);
  }

  @Get('projects/:id/milestones')
  @ApiOperation({ summary: 'View my project milestones' })
  @ApiOkResponse({ description: 'Project milestones' })
  findMilestones(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forwardGet(`/projects/${id}/milestones`, req);
  }

  @Get('projects/:id/documents')
  @ApiOperation({ summary: 'Browse my project documents' })
  @ApiOkResponse({ description: 'Paginated document metadata' })
  findDocuments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ClientPortalPageQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forwardGet(`/projects/${id}/documents`, req, query);
  }

  @Get('quotations')
  @ApiOperation({ summary: 'List my quotations' })
  @ApiOkResponse({ description: 'Paginated client quotations' })
  findQuotations(
    @Query() query: ClientPortalPageQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forwardGet('/quotations', req, query);
  }

  private url(path: string): string {
    const base = process.env.CLIENT_SERVICE_URL ?? 'http://localhost:4021';
    return `${base}/client-portal${path}`;
  }

  private forwardHeaders(req: AuthenticatedRequest) {
    const actorId = req.user?.id ?? req.user?.sub;

    return {
      authorization: req.headers.authorization,
      ...(actorId ? { 'x-user-id': actorId } : {}),
    };
  }

  private async forwardGet(
    path: string,
    req: AuthenticatedRequest,
    query?: ClientPortalPageQueryDto,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<unknown>(this.url(path), {
          headers: this.forwardHeaders(req),
          ...(query ? { params: query } : {}),
        }),
      );

      return response.data;
    } catch (error: unknown) {
      const downstream = (error as AxiosErrorShape).response;

      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }

      throw new HttpException(
        {
          code: 'CLIENT_SERVICE_UNAVAILABLE',
          message: 'Client service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
