import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { GoogleCalendarClient } from './google-calendar.client';
import { CalendarAuthGuard } from './guards/calendar-auth.guard';
import { CalendarConnectionRepository } from './repositories/calendar-connection.repository';
import { TokenEncryptionService } from './token-encryption.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    HttpModule,
    JwtModule.register({}),
  ],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarConnectionRepository,
    CalendarAuthGuard,
    GoogleCalendarClient,
    TokenEncryptionService,
    PrismaService,
  ],
})
export class CalendarModule {}
