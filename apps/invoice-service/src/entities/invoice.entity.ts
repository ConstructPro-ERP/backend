import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatusDto } from '../dto/invoice-status.dto';

export class InvoiceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty({ enum: InvoiceStatusDto })
  status!: InvoiceStatusDto;

  @ApiProperty()
  invoiceDate!: Date;

  @ApiPropertyOptional()
  dueDate!: Date | null;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  outstandingAmount!: number;
}
