import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { QuotationModule } from './quotation.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(QuotationModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors();

  const envPort = process.env.PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : 3009;
  if (!Number.isFinite(port)) throw new Error(`Invalid PORT: ${envPort}`);

  await app.listen(port);
  console.log(`Quotation service listening on http://localhost:${port}`);
}

bootstrap();
