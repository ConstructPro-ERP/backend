import { Controller, Get } from '@nestjs/common';
import { authRoutes } from '../routes/auth.routes';

@Controller('routes')
export class RoutesController {
  @Get()
  list() {
    // returns the array defined in src/routes/auth.routes.ts
    return authRoutes;
  }
}
