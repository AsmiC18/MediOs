import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { validateProductionConfig } from '../common/config/validate-production-config';
import { JobWorkerService } from '../jobs/job-worker.service';
import { WorkerModule } from './worker.module';

export async function bootstrapWorker(): Promise<void> {
  validateProductionConfig();

  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  const worker = app.get(JobWorkerService);
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`Received ${signal}, stopping worker...`);
    await worker.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  try {
    await worker.run();
  } catch (error) {
    logger.error(
      `Worker loop exited with error: ${error instanceof Error ? error.message : String(error)}`,
    );
    await app.close();
    process.exit(1);
  }
}
