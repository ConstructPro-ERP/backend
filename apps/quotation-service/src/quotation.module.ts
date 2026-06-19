import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { join } from 'node:path';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';
import { DocumentClient } from './document.client';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    HttpModule,
  ],
  controllers: [QuotationController],
  providers: [QuotationService, DocumentClient, PrismaService],
})
export class QuotationModule {}
