import {
  Body,
  Controller,
  Delete,
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
import { HttpService } from '@nestjs/axios';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import { AssignLeadDto } from '../../../lead-service/src/dto/assign-lead.dto';
import { CreateLeadNoteDto } from '../../../lead-service/src/dto/create-lead-note.dto';
import { CreateLeadDto } from '../../../lead-service/src/dto/create-lead.dto';
import {
  CreateLeadContactDto,
  UpdateLeadContactDto,
} from '../../../lead-service/src/dto/lead-contact.dto';
import { ListLeadsQueryDto } from '../../../lead-service/src/dto/list-lead-query.dto';
import { UpdateLeadStatusDto } from '../../../lead-service/src/dto/update-lead-status.dto';
import { UpdateLeadDto } from '../../../lead-service/src/dto/update-lead.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

// Roles allowed to work with leads in general (create/read/update).
const LEAD_ROLES = ['ADMIN', 'MANAGEMENT', 'SALES_MANAGER'];
// Destructive / re-assignment actions are limited to a smaller set.
const LEAD_MANAGE_ROLES = ['ADMIN', 'MANAGEMENT'];

interface AuthenticatedRequest extends Request {
  user?: { id?: string; sub?: string };
}

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
}

interface AxiosErrorShape {
  response?: { status?: number; data?: DownstreamError };
}

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...LEAD_ROLES)
@Controller('leads')
export class LeadGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  @ApiCreatedResponse({ description: 'Lead created' })
  create(@Body() body: CreateLeadDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/leads'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List leads with search, filtering, sorting and pagination',
  })
  findAll(@Query() query: ListLeadsQueryDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url('/leads'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lead by ID (includes notes and contacts)' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/leads/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a lead' })
  @ApiOkResponse({ description: 'Lead updated' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateLeadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/leads/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete(':id')
  @Roles(...LEAD_MANAGE_ROLES)
  @ApiOperation({ summary: 'Delete a lead' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/leads/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  // ── Assignment ────────────────────────────────────────────────────────────

  @Patch(':id/assign')
  @Roles(...LEAD_MANAGE_ROLES)
  @ApiOperation({ summary: 'Assign a lead to a Sales Manager' })
  assign(
    @Param('id') id: string,
    @Body() body: AssignLeadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/leads/${id}/assign`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  // ── Status ────────────────────────────────────────────────────────────────

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update lead status' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateLeadStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/leads/${id}/status`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a lead' })
  @ApiCreatedResponse({ description: 'Note created' })
  addNote(
    @Param('id') id: string,
    @Body() body: CreateLeadNoteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post(this.url(`/leads/${id}/notes`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'List notes for a lead' })
  getNotes(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/leads/${id}/notes`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete(':id/notes/:noteId')
  @ApiOperation({ summary: 'Delete a note from a lead' })
  @ApiNoContentResponse()
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/leads/${id}/notes/${noteId}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Add a contact entry to a lead' })
  @ApiCreatedResponse({ description: 'Contact created' })
  addContact(
    @Param('id') id: string,
    @Body() body: CreateLeadContactDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post(this.url(`/leads/${id}/contacts`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id/contacts/:contactId')
  @ApiOperation({ summary: 'Update a contact entry' })
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() body: UpdateLeadContactDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(
        this.url(`/leads/${id}/contacts/${contactId}`),
        body,
        { headers: this.forwardHeaders(req) },
      ),
    );
  }

  @Delete(':id/contacts/:contactId')
  @ApiOperation({ summary: 'Delete a contact entry from a lead' })
  @ApiNoContentResponse()
  deleteContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/leads/${id}/contacts/${contactId}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.LEAD_SERVICE_URL ?? 'http://localhost:4020';
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
          code: 'LEAD_SERVICE_UNAVAILABLE',
          message: 'Lead service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
