import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceSummaryService } from './finance-summary.service';
import {
  FinanceReportsController,
  InvoiceController,
  ProjectInvoiceController,
} from './invoice.controller';
import { InvoicePdfService } from './pdf/invoice-pdf.service';
import { InvoiceService } from './invoice.service';
import { FinanceSummaryRepository } from './repositories/finance-summary.repository';
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
  controllers: [
    InvoiceController,
    ProjectInvoiceController,
    FinanceReportsController,
  ],
  providers: [
    InvoiceService,
    FinanceSummaryService,
    InvoiceRepository,
    FinanceSummaryRepository,
    PrismaService,
  ],
})
export class InvoiceModule {}
