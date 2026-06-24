import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AiModule } from './ai.module';

async function bootstrap() {
  const app = await NestFactory.create(AiModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro AI Service')
    .setDescription(
      'ConstructPro AI forecasting, RAG indexing, retrieval, and provider orchestration APIs',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.AI_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 4012;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid AI_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);
  console.log(`AI service listening on http://localhost:${port}`);
}

void bootstrap();
