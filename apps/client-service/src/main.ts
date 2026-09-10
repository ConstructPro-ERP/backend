import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClientModule } from './client.module';

async function bootstrap() {
  const app = await NestFactory.create(ClientModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Client Service')
    .setDescription('Client management: CRUD and lead-to-client conversion')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.CLIENT_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 4021;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid CLIENT_SERVICE_PORT: ${rawPort}`);
  }
  await app.listen(port);
  console.log(`Client service listening on http://localhost:${port}`);
}

void bootstrap();
