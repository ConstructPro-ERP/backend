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
import { HttpService } from '@nestjs/axios';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import {
  CreateInvoiceDto,
  CreateProjectInvoiceDto,
} from '../../../invoice-service/src/dto/create-invoice.dto';
import {
  FinanceDateRangeQueryDto,
  OutstandingInvoiceReportQueryDto,
} from '../../../invoice-service/src/dto/finance-report-query.dto';
import { ListInvoicesQueryDto } from '../../../invoice-service/src/dto/list-invoices-query.dto';
import { UpdateInvoiceDto } from '../../../invoice-service/src/dto/update-invoice.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const INVOICE_ROLES = ['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'];

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

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...INVOICE_ROLES)
@Controller()
export class InvoicesGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('invoices')
  @ApiOperation({ summary: 'Create an invoice' })
  @ApiResponse({ status: 201, description: 'Invoice created' })
  create(@Body() body: CreateInvoiceDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/invoices'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Post('projects/:projectId/invoices')
  @ApiOperation({ summary: 'Generate an invoice for a project' })
  createForProject(
    @Param('projectId') projectId: string,
    @Body() body: CreateProjectInvoiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post(this.url(`/projects/${projectId}/invoices`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices with pagination and filtering' })
  findAll(
    @Query() query: ListInvoicesQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url('/invoices'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('invoices/:id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/invoices/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('invoices/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateInvoiceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/invoices/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel an invoice' })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.patch(
        this.url(`/invoices/${id}/cancel`),
        {},
        { headers: this.forwardHeaders(req) },
      ),
    );
  }

  @Get('reports/finance/clients/:customerId/summary')
  @ApiOperation({ summary: 'Get a client finance summary' })
  clientSummary(
    @Param('customerId') customerId: string,
    @Query() query: FinanceDateRangeQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(
        this.url(`/reports/finance/clients/${customerId}/summary`),
        {
          headers: this.forwardHeaders(req),
          params: query,
        },
      ),
    );
  }

  @Get('reports/finance/projects/:projectId/summary')
  @ApiOperation({ summary: 'Get a project finance summary' })
  projectSummary(
    @Param('projectId') projectId: string,
    @Query() query: FinanceDateRangeQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(
        this.url(`/reports/finance/projects/${projectId}/summary`),
        {
          headers: this.forwardHeaders(req),
          params: query,
        },
      ),
    );
  }

  @Get('reports/finance/invoices/outstanding')
  @ApiOperation({ summary: 'List outstanding invoices with balances' })
  outstandingInvoices(
    @Query() query: OutstandingInvoiceReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url('/reports/finance/invoices/outstanding'), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.INVOICE_SERVICE_URL ?? 'http://localhost:4010';
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
          code: 'INVOICE_SERVICE_UNAVAILABLE',
          message: 'Invoice service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
