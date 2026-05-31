import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { validateEnv } from './common/config/env.schema';

async function bootstrap() {
  validateEnv(process.env as Record<string, unknown>);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const logger = app.get(AppLogger);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  app.use(cookieParser());

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('SyncUp API')
      .setDescription('SyncUp backend API docs')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  if (process.env.SWAGGER === 'true') {
    logger.log(`Swagger is running on: http://localhost:${port}/swagger`);
  }
}

bootstrap().catch((err) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      context: 'Bootstrap',
      message: 'Failed to start application',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
