import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClientPortalReadService } from './client-portal-read.service';
import { ClientPortalPageQueryDto } from './dto/client-portal-page-query.dto';

@ApiTags('Client Portal')
@ApiBearerAuth()
@Controller('client-portal')
export class ClientPortalController {
  constructor(private readonly portal: ClientPortalReadService) {}

  @Get('projects')
  @ApiOperation({ summary: 'List my projects' })
  @ApiOkResponse({ description: 'Paginated client projects' })
  findProjects(
    @Headers('x-user-id') actorId: string | undefined,
    @Query() query: ClientPortalPageQueryDto,
  ) {
    return this.portal.findProjects(actorId, query);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'View my project details and progress' })
  @ApiOkResponse({ description: 'Client project details' })
  findProject(
    @Headers('x-user-id') actorId: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.portal.findProject(actorId, id);
  }

  @Get('projects/:id/milestones')
  @ApiOperation({ summary: 'View my project milestones' })
  @ApiOkResponse({ description: 'Project milestones' })
  findMilestones(
    @Headers('x-user-id') actorId: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.portal.findMilestones(actorId, id);
  }

  @Get('projects/:id/documents')
  @ApiOperation({ summary: 'Browse my project documents' })
  @ApiOkResponse({ description: 'Paginated document metadata' })
  findDocuments(
    @Headers('x-user-id') actorId: string | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ClientPortalPageQueryDto,
  ) {
    return this.portal.findDocuments(actorId, id, query);
  }

  @Get('quotations')
  @ApiOperation({ summary: 'List my quotations' })
  @ApiOkResponse({ description: 'Paginated client quotations' })
  findQuotations(
    @Headers('x-user-id') actorId: string | undefined,
    @Query() query: ClientPortalPageQueryDto,
  ) {
    return this.portal.findQuotations(actorId, query);
  }
}
