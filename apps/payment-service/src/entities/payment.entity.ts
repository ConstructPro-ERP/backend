import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodDto } from '../dto/create-payment.dto';

export class PaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  invoiceId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  referenceNumber!: string;

  @ApiProperty()
  paymentDate!: Date;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ enum: PaymentMethodDto })
  paymentMethod!: PaymentMethodDto;

  @ApiPropertyOptional()
  notes!: string | null;
}
