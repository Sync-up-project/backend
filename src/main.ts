import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Cookie 파싱 (refresh_token 등 HttpOnly 쿠키 사용을 위해 필요)
  app.use(cookieParser());

  // ✅ CORS 설정 (쿠키 포함 요청을 위해 credentials: true 필수)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // ✅ Swagger 설정 (SWAGGER=true 일 때만)
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

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  if (process.env.SWAGGER === 'true') {
    console.log(`Swagger is running on: http://localhost:${port}/swagger`);
  }
}

bootstrap();
