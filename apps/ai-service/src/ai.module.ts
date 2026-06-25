import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiForecastingController } from './ai-forecasting.controller';
import { AiForecastingService } from './ai-forecasting.service';
import { AiPromptService } from './ai-prompt.service';
import { AiProviderService } from './ai-provider.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { AiRepository } from './repositories/ai.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [AiForecastingController, RagController],
  providers: [
    AiForecastingService,
    AiPromptService,
    AiProviderService,
    RagService,
    AiRepository,
    PrismaService,
  ],
})
export class AiModule {}
