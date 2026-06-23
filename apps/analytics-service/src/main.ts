import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AnalyticsModule } from './analytics.module';

async function bootstrap() {
  const app = await NestFactory.create(AnalyticsModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Analytics Service')
    .setDescription('DDP-27 KPI dashboard aggregation APIs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.ANALYTICS_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 4011;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid ANALYTICS_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);
  console.log(`Analytics service listening on http://localhost:${port}`);
}

void bootstrap();
