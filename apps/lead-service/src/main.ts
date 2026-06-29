import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { LeadModule } from './lead.module';

async function bootstrap() {
  const app = await NestFactory.create(LeadModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConstructPro Lead Service')
    .setDescription(
      'Lead management: CRUD, assignment, status, notes and contacts',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const rawPort = process.env.LEAD_SERVICE_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 4020;
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid LEAD_SERVICE_PORT: ${rawPort}`);
  }
  await app.listen(port);
  console.log(`Lead service listening on http://localhost:${port}`);
}

void bootstrap();
