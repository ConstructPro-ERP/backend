import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { ClientRepository } from './repository/client.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [ClientController],
  providers: [ClientService, ClientRepository, PrismaService],
})
export class ClientModule {}
