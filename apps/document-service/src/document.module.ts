import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { CloudinaryModule } from '../../../libs/common/src/cloudinary/cloudinary.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentController } from './document.controller';
import { DocumentReconciliationService } from './document-reconciliation.service';
import { DocumentService } from './document.service';
import { DocumentRepository } from './repositories/document.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    CloudinaryModule,
  ],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    DocumentReconciliationService,
    DocumentRepository,
    PrismaService,
  ],
})
export class DocumentModule {}
