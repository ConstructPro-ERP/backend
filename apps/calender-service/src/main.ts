import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CalendarModule } from './calendar.module';

export async function bootstrap() {
  const app = await NestFactory.create(CalendarModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Calendar Service')
    .setDescription('Google Calendar integration for ConstructPro users')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort =
    process.env.CALENDAR_SERVICE_PORT ?? process.env.PORT ?? '4013';

  const port = Number.parseInt(rawPort, 10);

  if (!Number.isFinite(port)) {
    throw new Error(`Invalid CALENDAR_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);

  console.log(`Calendar service listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
