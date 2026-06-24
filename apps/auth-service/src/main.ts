import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors();

  const envPort = process.env.AUTH_SERVICE_PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : 3333;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid AUTH_SERVICE_PORT: ${envPort}`);
  }

  await app.listen(port);
  console.log(`Auth service listening on http://localhost:${port}`);
}

void bootstrap();
