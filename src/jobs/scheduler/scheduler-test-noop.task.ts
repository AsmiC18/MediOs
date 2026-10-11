import { Injectable } from '@nestjs/common';
import {
  SchedulerExecutionContext,
  SchedulerTask,
} from './scheduler.types';

import { JOB_TYPES } from '../job-types.constants';

/** Non-production scheduler task type for infrastructure tests only. */
export const SCHEDULER_TEST_NOOP_JOB_TYPE = JOB_TYPES.SCHEDULER_TEST_NOOP;

/**
 * Enqueues a no-op job row to prove scheduler → JobService.enqueue wiring.
 * Not a hospital business workflow.
 */
@Injectable()
export class SchedulerTestNoopTask implements SchedulerTask {
  readonly name = 'scheduler-test-noop';
  readonly requiresTestHospitalId = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    if (!context.hospitalId) {
      throw new Error(
        'Scheduler test noop task requires JOB_SCHEDULER_TEST_HOSPITAL_ID',
      );
    }

    const idempotencyKey = `${SCHEDULER_TEST_NOOP_JOB_TYPE}:${context.windowKey}`;
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId: context.hospitalId,
      type: SCHEDULER_TEST_NOOP_JOB_TYPE,
      idempotencyKey,
      payload: {
        purpose: 'scheduler-infrastructure-test-only',
        windowKey: context.windowKey,
      },
      maxAttempts: 1,
    });
  }
}
