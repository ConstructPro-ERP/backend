// typescript
// app.module.ts
// typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthGatewayController } from './controllers/auth-gateway.controller';
import { RoutesController } from './controllers/routes.controller'; // remove or adjust if this file does not exist

@Module({
  imports: [HttpModule],
  controllers: [AuthGatewayController, RoutesController],
})
export class AppModule {}
