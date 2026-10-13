import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TaskModule } from './task.module';

export async function bootstrap() {
  const app = await NestFactory.create(TaskModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Task Service')
    .setDescription('Project task management and assignment APIs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.TASK_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3004;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TASK_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);

  console.log(`Task service listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
