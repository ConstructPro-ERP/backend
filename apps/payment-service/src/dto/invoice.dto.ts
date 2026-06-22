import { ApiProperty } from '@nestjs/swagger';
import { PaymentEntity } from '../entities/payment.entity';

export class PaymentInvoiceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  outstandingAmount!: number;

  @ApiProperty({ enum: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] })
  status!: string;
}

export class RecordPaymentResponseDto {
  @ApiProperty({ type: PaymentEntity })
  payment!: PaymentEntity;

  @ApiProperty({ type: PaymentInvoiceSummaryDto })
  invoice!: PaymentInvoiceSummaryDto;
}
