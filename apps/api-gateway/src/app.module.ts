// typescript
// app.module.ts
// typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config'; // ← add this import
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { QuotationsGatewayController } from './controllers/quotations-gateway.controller';
import { RoutesController } from './controllers/routes.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      // ← add this
      isGlobal: true,
      envFilePath: '../../../.env',
    }),
    HttpModule,
  ],
  controllers: [
    AuthGatewayController,
    QuotationsGatewayController,
    RoutesController,
  ],
})
export class AppModule {}
