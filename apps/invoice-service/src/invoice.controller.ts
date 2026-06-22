import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateInvoiceDto,
  CreateProjectInvoiceDto,
} from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceService } from './invoice.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Create an invoice linked to a project and client' })
  @ApiCreatedResponse({ type: InvoiceEntity })
  create(
    @Body() dto: CreateInvoiceDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.invoiceService.create(dto, actorId);
  }

  @Get()
  @ApiOperation({
    summary: 'List invoices with filters, sorting and pagination',
  })
  findAll(@Query() query: ListInvoicesQueryDto) {
    return this.invoiceService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: InvoiceEntity })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoiceService.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: InvoiceEntity })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInvoiceDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.invoiceService.update(id, dto, actorId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an invoice as CANCELLED' })
  @ApiOkResponse({ type: InvoiceEntity })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.invoiceService.cancel(id, actorId);
  }
}

@ApiTags('Project invoices')
@ApiBearerAuth()
@Controller('projects/:projectId/invoices')
export class ProjectInvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @ApiOperation({ summary: 'Generate an invoice for a project' })
  @ApiCreatedResponse({ type: InvoiceEntity })
  createForProject(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateProjectInvoiceDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.invoiceService.createForProject(projectId, dto, actorId);
  }
}
