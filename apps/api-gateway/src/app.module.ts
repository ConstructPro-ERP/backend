import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AiForecastingGatewayController } from './controllers/ai-forecasting-gateway.controller';
import { AnalyticsGatewayController } from './controllers/analytics-gateway.controller';
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { InvoicesGatewayController } from './controllers/invoices-gateway.controller';
import { PaymentsGatewayController } from './controllers/payments-gateway.controller';
import { QuotationsGatewayController } from './controllers/quotations-gateway.controller';
import { RoutesController } from './controllers/routes.controller';

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
    QuotationsGatewayController,
    InvoicesGatewayController,
    PaymentsGatewayController,
    RoutesController,
  ],
})
export class AppModule {}
