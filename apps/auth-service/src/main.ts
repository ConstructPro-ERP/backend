import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const envPort = process.env.PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : 3333;
  if (!Number.isFinite(port)) throw new Error(`Invalid PORT: ${envPort}`);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log('Auth service listening on http://localhost:3333');
}
bootstrap();