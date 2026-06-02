// File: `backend/apps/api-gateway/src/main.ts` (important lines)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor()); // normalizes successful responses
  app.useGlobalFilters(new HttpExceptionFilter()); // normalizes errors
  await app.listen(3000);
  console.log('API gateway listening on http://localhost:3000');
}
bootstrap();