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
import {
  CreateClientDto,
  UpdateClientDto,
} from '../../../client-service/src/dto/client.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

// Broad read access for anyone who legitimately touches client records.
const CLIENT_READ_ROLES = [
  'ADMIN',
  'MANAGEMENT',
  'SALES_MANAGER',
  'ACCOUNTANT',
  'PROJECT_MANAGER',
];
// Creating / mutating client records is limited to sales & management.
const CLIENT_WRITE_ROLES = ['ADMIN', 'MANAGEMENT', 'SALES_MANAGER'];

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

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CLIENT_READ_ROLES)
@Controller('clients')
export class ClientGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post()
  @Roles(...CLIENT_WRITE_ROLES)
  @ApiOperation({
    summary: 'Create a new client (optionally linked to a lead)',
  })
  @ApiCreatedResponse({ description: 'Client created' })
  create(@Body() body: CreateClientDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/clients'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all clients' })
  @ApiOkResponse({ description: 'List of clients' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url('/clients'), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client by ID' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/clients/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch(':id')
  @Roles(...CLIENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Update a client' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateClientDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/clients/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete(':id')
  @Roles(...CLIENT_WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a client' })
  @ApiNoContentResponse()
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/clients/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.CLIENT_SERVICE_URL ?? 'http://localhost:4021';
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
          code: 'CLIENT_SERVICE_UNAVAILABLE',
          message: 'Client service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
