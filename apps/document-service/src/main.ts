import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DocumentModule } from './document.module';

export async function bootstrap() {
  const app = await NestFactory.create(DocumentModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Document Service')
    .setDescription('Secure project document and category management APIs')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.DOCUMENT_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3006;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DOCUMENT_SERVICE_PORT: ${rawPort}`);
  }

  await app.listen(port);

  console.log(`Document service listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
