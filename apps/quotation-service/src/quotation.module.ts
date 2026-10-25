import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { join } from 'node:path';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';
import { DocumentClient } from './document.client';
import { ProjectClient } from './project.client';
import { NotificationClient } from './notification.client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CloudinaryModule } from '../../../libs/common/src/cloudinary/cloudinary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    HttpModule,
    CloudinaryModule,
  ],
  controllers: [QuotationController],
  providers: [
    QuotationService,
    DocumentClient,
    ProjectClient,
    NotificationClient,
    PrismaService,
  ],
})
export class QuotationModule {}
