import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  InvoiceController,
  ProjectInvoiceController,
} from './invoice.controller';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import { InvoiceService } from './invoice.service';
import { InvoiceRepository } from './repositories/invoice.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [InvoiceController, ProjectInvoiceController],
  providers: [
    InvoiceService,
    InvoiceRepository,
    InvoicePdfService,
    PrismaService,
  ],
})
export class InvoiceModule {}
