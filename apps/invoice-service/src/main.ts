import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { InvoiceModule } from './invoice.module';

async function bootstrap() {
  const app = await NestFactory.create(InvoiceModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Invoice Service')
    .setDescription('DDP-23 invoice CRUD and project invoice generation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.INVOICE_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 4010;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid INVOICE_SERVICE_PORT: ${rawPort}`);
  }
  await app.listen(port);
  console.log(`Invoice service listening on http://localhost:${port}`);
}

void bootstrap();
