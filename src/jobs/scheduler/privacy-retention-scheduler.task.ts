import { Injectable } from '@nestjs/common';
import { loadPrivacyRetentionConfig } from '../../privacy/privacy-retention.config';
import { JOB_TYPES } from '../job-types.constants';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcDayWindow } from './scheduler-window.util';

/** Enqueues one privacy retention purge job per hospital per UTC day (enqueue-only). */
@Injectable()
export class PrivacyRetentionSchedulerTask implements SchedulerTask {
  readonly name = 'privacy-retention-purge';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadPrivacyRetentionConfig();
    if (!config.enabled) {
      return;
    }

    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'privacy-retention-purge requires hospitalId in scheduler context',
      );
    }

    const windowKey = formatUtcDayWindow(context.tickAt);
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId,
      branchId: null,
      type: JOB_TYPES.PRIVACY_RETENTION_PURGE,
      idempotencyKey: `${JOB_TYPES.PRIVACY_RETENTION_PURGE}:${hospitalId}:${windowKey}`,
      payload: { window: windowKey },
      maxAttempts: 5,
    });
  }
}
