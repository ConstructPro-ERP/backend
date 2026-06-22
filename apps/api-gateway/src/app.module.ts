// typescript
// app.module.ts
// typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config'; // ← add this import
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { QuotationsGatewayController } from './controllers/quotations-gateway.controller';
import { RoutesController } from './controllers/routes.controller';
import { InvoicesGatewayController } from './controllers/invoices-gateway.controller';
import { PaymentsGatewayController } from './controllers/payments-gateway.controller';
import { join } from 'node:path';

@Module({
  imports: [
    ConfigModule.forRoot({
      // ← add this
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    HttpModule,
  ],
  controllers: [
    AuthGatewayController,
    QuotationsGatewayController,
    InvoicesGatewayController,
    PaymentsGatewayController,
    RoutesController,
  ],
})
export class AppModule {}
