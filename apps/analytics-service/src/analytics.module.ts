import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { AnalyticsRepository } from './repositories/analytics.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [AnalyticsController, RagController],
  providers: [AnalyticsService, RagService, AnalyticsRepository, PrismaService],
})
export class AnalyticsModule {}
