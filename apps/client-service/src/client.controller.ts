import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { ClientEntity } from './entities/client.entity';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new client (optionally linked to a lead)',
  })
  @ApiCreatedResponse({ type: ClientEntity })
  create(@Body() dto: CreateClientDto) {
    return this.clientService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all clients' })
  @ApiOkResponse({ type: ClientEntity, isArray: true })
  findAll() {
    return this.clientService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client by ID' })
  @ApiOkResponse({ type: ClientEntity })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a client' })
  @ApiOkResponse({ type: ClientEntity })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client' })
  @ApiNoContentResponse()
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clientService.remove(id);
  }
}
