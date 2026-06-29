import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';
import { LeadRepository } from './repository/lead.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [LeadController],
  providers: [LeadService, LeadRepository, PrismaService],
})
export class LeadModule {}
