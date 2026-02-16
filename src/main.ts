import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger 설정 (로컬에서만 켜기: SWAGGER=true 일 때만)
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
    SwaggerModule.setup('swagger', app, document); // http://localhost:<port>/swagger
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  if (process.env.SWAGGER === 'true') {
    console.log(`Swagger is running on: http://localhost:${port}/swagger`);
  }
}
bootstrap();
