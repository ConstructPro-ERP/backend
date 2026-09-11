import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ProjectModule } from './project.module';

export async function bootstrap() {
  const app = await NestFactory.create(ProjectModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Project Service')
    .setDescription('Project management and project operations APIs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.PROJECT_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3003;

  if (!Number.isFinite(port)) {
    throw new Error(`Invalid PROJECT_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);
  console.log(`Project service listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
