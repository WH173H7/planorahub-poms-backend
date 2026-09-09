import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
  ].filter((origin): origin is string => Boolean(origin));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 4000);

  await app.listen(port, '0.0.0.0');

  console.log(
    `PlanoraHub POMS API running on port ${port}`,
  );
}

void bootstrap();
