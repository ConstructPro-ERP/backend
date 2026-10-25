import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClientController } from './client.controller';
import { ClientPortalAccessService } from './client-portal-access.service';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalReadService } from './client-portal-read.service';
import { ClientService } from './client.service';
import { ClientRepository } from './repository/client.repository';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
  ],
  controllers: [ClientController, ClientPortalController],
  providers: [
    ClientService,
    ClientPortalAccessService,
    ClientPortalReadService,
    ClientRepository,
    PrismaService,
  ],
})
export class ClientModule {}
