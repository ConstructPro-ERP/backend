import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AiForecastingGatewayController } from './controllers/ai-forecasting-gateway.controller';
import { AnalyticsGatewayController } from './controllers/analytics-gateway.controller';
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { ProjectsGatewayController } from './controllers/projects-gateway.controller';
import { MilestonesGatewayController } from './controllers/milestones-gateway.controller';
import { TasksGatewayController } from './controllers/tasks-gateway.controller';
import { InvoicesGatewayController } from './controllers/invoices-gateway.controller';
import { PaymentsGatewayController } from './controllers/payments-gateway.controller';
import { QuotationsGatewayController } from './controllers/quotations-gateway.controller';
import { RagGatewayController } from './controllers/rag-gateway.controller';
import { UsersGatewayController } from './controllers/users-gateway.controller';
import { LeadGatewayController } from './controllers/lead-gateway.controller';
import { ClientGatewayController } from './controllers/client-gateway.controller';
import { CalendarGatewayController } from './controllers/calendar-gateway.controller';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    HttpModule,
  ],
  controllers: [
    AiForecastingGatewayController,
    AnalyticsGatewayController,
    AuthGatewayController,
    ProjectsGatewayController,
    MilestonesGatewayController,
    TasksGatewayController,
    QuotationsGatewayController,
    InvoicesGatewayController,
    PaymentsGatewayController,
    RagGatewayController,
    UsersGatewayController,
    LeadGatewayController,
    ClientGatewayController,
    CalendarGatewayController,
  ],
})
export class AppModule {}
