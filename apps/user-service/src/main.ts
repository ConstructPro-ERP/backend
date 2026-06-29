import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { UserModule } from './user.module';

async function bootstrap() {
  const app = await NestFactory.create(UserModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const envPort = process.env.USER_SERVICE_PORT ?? process.env.PORT ?? '3334';
  const port = Number.parseInt(envPort, 10);
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid port: ${envPort}`);
  }

  await app.listen(port);
  console.log(`User service listening on http://localhost:${port}`);
}

void bootstrap();
