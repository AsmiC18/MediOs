import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/config/cors.config';
import { isTrustProxyEnabled } from './common/config/trust-proxy.config';
import { validateProductionConfig } from './common/config/validate-production-config';
import { RateLimitExceptionFilter } from './common/rate-limit/rate-limit-exception.filter';

async function bootstrap() {
  validateProductionConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  if (isTrustProxyEnabled()) {
    app.set('trust proxy', 1);
  }

  app.useGlobalFilters(new RateLimitExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();
  app.enableCors(buildCorsOptions());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Medios API running on http://localhost:${port}`);
}

void bootstrap();
