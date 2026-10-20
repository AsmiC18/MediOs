import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { truncateJobError } from '../job-error.util';
import { mapWithBoundedConcurrency } from './scheduler-bounded-concurrency.util';
import { schedulerSavepoint } from './scheduler-savepoint.util';
import {
  SchedulerExecutionContext,
  SchedulerTask,
} from './scheduler.types';

const logger = new Logger('SchedulerPerHospital');

export type RunSchedulerTaskForEachHospitalOptions = {
  scheduler: string;
  windowKey: string;
  taskName: string;
  taskIndex: number;
  taskTransactionTimeoutMs: number;
  taskTransactionMaxWaitMs: number;
  /** Max hospitals processed concurrently (each in its own transaction). */
  hospitalConcurrency: number;
};

async function runOneHospitalTransaction(
  prisma: PrismaService,
  task: SchedulerTask,
  context: Omit<SchedulerExecutionContext, 'transaction' | 'hospitalId'>,
  hospitalId: string,
  options: RunSchedulerTaskForEachHospitalOptions,
): Promise<void> {
  const hospitalStarted = Date.now();
  await prisma.$transaction(
    async (transaction) => {
      const savepointName = `scheduler_task_${options.taskIndex}`;
      await schedulerSavepoint(transaction, 'SAVEPOINT', savepointName);
      try {
        await task.run({
          ...context,
          hospitalId,
          transaction,
        });
        await schedulerSavepoint(
          transaction,
          'RELEASE SAVEPOINT',
          savepointName,
        );
      } catch (error) {
        await schedulerSavepoint(
          transaction,
          'ROLLBACK TO SAVEPOINT',
          savepointName,
        );
        throw error;
      }
    },
    {
      maxWait: options.taskTransactionMaxWaitMs,
      timeout: options.taskTransactionTimeoutMs,
    },
  );
  logger.log(
    JSON.stringify({
      event: 'scheduler_task_hospital_completed',
      scheduler: options.scheduler,
      windowKey: options.windowKey,
      task: options.taskName,
      hospitalId,
      durationMs: Date.now() - hospitalStarted,
    }),
  );
}

/**
 * Runs a scheduler task once per hospital, each in a separate interactive
 * transaction. Committed hospitals stay enqueued if a later hospital fails;
 * idempotency keys prevent duplicates on retry.
 */
export async function runSchedulerTaskForEachHospital(
  prisma: PrismaService,
  task: SchedulerTask,
  context: Omit<SchedulerExecutionContext, 'transaction' | 'hospitalId'>,
  options: RunSchedulerTaskForEachHospitalOptions,
): Promise<void> {
  const taskStarted = Date.now();
  const hospitals = await prisma.hospital.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  logger.log(
    JSON.stringify({
      event: 'scheduler_task_hospitals_started',
      scheduler: options.scheduler,
      windowKey: options.windowKey,
      task: options.taskName,
      hospitalCount: hospitals.length,
      hospitalConcurrency: options.hospitalConcurrency,
    }),
  );

  const errors = await mapWithBoundedConcurrency(
    hospitals,
    options.hospitalConcurrency,
    async (hospital) => {
      await runOneHospitalTransaction(
        prisma,
        task,
        context,
        hospital.id,
        options,
      );
    },
  );

  logger.log(
    JSON.stringify({
      event: 'scheduler_task_hospitals_finished',
      scheduler: options.scheduler,
      windowKey: options.windowKey,
      task: options.taskName,
      hospitalCount: hospitals.length,
      hospitalsFailed: errors.length,
      durationMs: Date.now() - taskStarted,
    }),
  );

  if (errors.length > 0) {
    logger.warn(
      JSON.stringify({
        event: 'scheduler_task_hospitals_partial_failure',
        scheduler: options.scheduler,
        windowKey: options.windowKey,
        task: options.taskName,
        hospitalsFailed: errors.length,
        message: truncateJobError(errors[0]),
      }),
    );
    throw errors[0];
  }
}
