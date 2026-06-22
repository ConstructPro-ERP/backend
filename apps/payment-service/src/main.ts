import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { PaymentModule } from './payment.module';

async function bootstrap() {
  const app = await NestFactory.create(PaymentModule);
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
    .setTitle('ConstructPro Payment Service')
    .setDescription('DDP-24 payment tracking and invoice status updates')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.PAYMENT_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3005;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid PAYMENT_SERVICE_PORT: ${rawPort}`);
  }
  await app.listen(port);
  console.log(`Payment service listening on http://localhost:${port}`);
}

void bootstrap();
