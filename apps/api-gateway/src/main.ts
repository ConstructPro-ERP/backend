import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const envPort = process.env.PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : 3000;
  if (!Number.isFinite(port)) throw new Error(`Invalid PORT: ${envPort}`);

  app.setGlobalPrefix('api');
  app.enableCors();

  // Temporary local check endpoint to verify the gateway is alive.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.get('/health', (_req, res) => {
    res.status(200).json({
      service: 'api-gateway',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  await app.listen(port);

  Logger.log(`API Gateway is running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Health check: http://localhost:${port}/health`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    'Failed to start API Gateway',
    error instanceof Error ? error.stack : undefined,
    'Bootstrap',
  );
  process.exit(1);
});
