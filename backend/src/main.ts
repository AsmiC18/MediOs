import 'reflect-metadata';
import 'dotenv/config';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Database } from './database';
import { StaffGuard } from './auth';
import { InboxController, InboxService, SessionController } from './inbox';
import { WebhookController } from './webhook';
import { SendWorker } from './worker';

@Module({ controllers: [InboxController, SessionController, WebhookController], providers: [Database, StaffGuard, InboxService, SendWorker] })
class AppModule {}

async function bootstrap() {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'FRONTEND_ORIGIN']) {
    if (!process.env[key]) throw new Error(`${key} must be configured`);
  }
  if (process.env.JWT_SECRET!.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN, allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], methods: ['GET', 'POST', 'PATCH'] });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3001), '127.0.0.1');
}
void bootstrap().catch(() => { console.error('Backend startup failed. Check configuration and database availability.'); process.exitCode = 1; });
