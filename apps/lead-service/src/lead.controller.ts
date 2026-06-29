import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  CreateLeadContactDto,
  UpdateLeadContactDto,
} from './dto/lead-contact.dto';
import { ListLeadsQueryDto } from './dto/list-lead-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import {
  LeadContactEntity,
  LeadEntity,
  LeadNoteEntity,
} from './entities/lead.entity';
import { LeadService } from './lead.service';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  @ApiCreatedResponse({ type: LeadEntity })
  create(@Body() dto: CreateLeadDto) {
    return this.leadService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List leads with search, filtering, sorting and pagination',
  })
  findAll(@Query() query: ListLeadsQueryDto) {
    return this.leadService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lead by ID (includes notes and contacts)' })
  @ApiOkResponse({ type: LeadEntity })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leadService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a lead' })
  @ApiOkResponse({ type: LeadEntity })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lead' })
  @ApiNoContentResponse()
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leadService.remove(id);
  }

  // ── Assignment ────────────────────────────────────────────────────────────────

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Assign a lead to a Sales Manager' })
  @ApiOkResponse({ type: LeadEntity })
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leadService.assign(id, dto.assignedToId);
  }

  // ── Status ────────────────────────────────────────────────────────────────────

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update lead status' })
  @ApiOkResponse({ type: LeadEntity })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leadService.updateStatus(id, dto.status);
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a lead' })
  @ApiCreatedResponse({ type: LeadNoteEntity })
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateLeadNoteDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.leadService.addNote(id, dto, actorId);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'List notes for a lead' })
  @ApiOkResponse({ type: LeadNoteEntity, isArray: true })
  getNotes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leadService.getNotes(id);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a note from a lead' })
  @ApiNoContentResponse()
  deleteNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
  ) {
    return this.leadService.deleteNote(id, noteId);
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Add a contact entry to a lead' })
  @ApiCreatedResponse({ type: LeadContactEntity })
  addContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateLeadContactDto,
  ) {
    return this.leadService.addContact(id, dto);
  }

  @Patch(':id/contacts/:contactId')
  @ApiOperation({ summary: 'Update a contact entry' })
  @ApiOkResponse({ type: LeadContactEntity })
  updateContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Body() dto: UpdateLeadContactDto,
  ) {
    return this.leadService.updateContact(id, contactId, dto);
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact entry from a lead' })
  @ApiNoContentResponse()
  deleteContact(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
  ) {
    return this.leadService.deleteContact(id, contactId);
  }
}
