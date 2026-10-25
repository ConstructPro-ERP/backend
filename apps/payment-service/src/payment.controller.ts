import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RecordPaymentResponseDto } from './dto/invoice.dto';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({ summary: 'Record a payment against an issued invoice' })
  @ApiCreatedResponse({
    description: 'Payment recorded and invoice balances/status updated',
    type: RecordPaymentResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Amount is invalid or exceeds the outstanding balance',
    schema: {
      example: {
        code: 'PAYMENT_EXCEEDS_OUTSTANDING',
        message: 'Payment amount cannot exceed the outstanding balance.',
        outstandingAmount: 5000,
      },
    },
  })
  @ApiConflictResponse({
    description: 'Invoice is not payable or reference number already exists',
  })
  create(
    @Body() dto: CreatePaymentDto,
    @Headers('x-user-id') actorId?: string,
  ) {
    return this.paymentService.create(dto, actorId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: PaymentEntity })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.paymentService.findOne(id);
  }
}

@ApiTags('Invoice payments')
@ApiBearerAuth()
@Controller('invoices/:invoiceId/payments')
export class InvoicePaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @ApiOperation({ summary: 'Get complete payment history for an invoice' })
  history(@Param('invoiceId', new ParseUUIDPipe()) invoiceId: string) {
    return this.paymentService.history(invoiceId);
  }
}
