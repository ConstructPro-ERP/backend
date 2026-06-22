import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import { CreatePaymentDto } from '../../../payment-service/src/dto/create-payment.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const PAYMENT_ROLES = ['ADMIN', 'MANAGEMENT', 'FINANCE', 'ACCOUNTANT'];

interface AuthenticatedRequest extends Request {
  user?: { id?: string; sub?: string };
}

interface DownstreamError {
  code?: string;
  message?: string;
  details?: unknown;
  outstandingAmount?: number;
}

interface AxiosErrorShape {
  response?: { status?: number; data?: DownstreamError };
}

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PAYMENT_ROLES)
@Controller()
export class PaymentsGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('payments')
  @ApiOperation({ summary: 'Record a payment and update invoice balances' })
  @ApiCreatedResponse({
    description: 'Payment recorded and invoice balances/status updated',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Amount is invalid or exceeds the outstanding balance',
  })
  @ApiConflictResponse({
    description: 'Invoice is not payable or reference number already exists',
  })
  create(@Body() body: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.post(this.url('/payments'), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('payments/:id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.forward(() =>
      this.httpService.get(this.url(`/payments/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('invoices/:invoiceId/payments')
  @ApiOperation({ summary: 'Get payment history for an invoice' })
  history(
    @Param('invoiceId') invoiceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/invoices/${invoiceId}/payments`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3005';
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
          code: 'PAYMENT_SERVICE_UNAVAILABLE',
          message: 'Payment service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
