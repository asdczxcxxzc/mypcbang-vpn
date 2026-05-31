import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 관리자 웹/클라이언트에서 호출할 수 있도록 CORS 허용
  app.enableCors({ origin: true, credentials: true });

  // DTO 검증 자동 적용
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`✅ 백엔드 API 서버 실행 중: http://localhost:${port}`);
}
bootstrap();
