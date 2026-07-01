// File: `backend/apps/api-gateway/src/main.ts` (important lines)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { authRoutes } from './routes/auth.routes';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor()); // normalizes successful responses
  app.useGlobalFilters(new HttpExceptionFilter()); // normalizes errors
  app.setGlobalPrefix('api');
  // Log auth route map for visibility
  console.log(
    'Auth routes:',
    authRoutes.map((r) => `${r.method} ${r.path} -> ${r.target}`).join('\n'),
  );
  app.enableCors({
    origin: true,
    credentials: true,
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro API')
    .setDescription(
      'ConstructPro gateway API, including DDP-23 invoice APIs and DDP-29 AI forecasting APIs',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  const envPort = process.env.PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : 4000;
  if (!Number.isFinite(port)) throw new Error(`Invalid PORT: ${envPort}`);
  await app.listen(port);
  console.log(`API gateway listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
