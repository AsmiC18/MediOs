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

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadPrivacyRetentionConfig();
    if (!config.enabled) {
      return;
    }

    const windowKey = formatUtcDayWindow(context.tickAt);
    const hospitals = await context.transaction.hospital.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const hospital of hospitals) {
      await context.jobService.enqueueWithClient(context.transaction, {
        hospitalId: hospital.id,
        branchId: null,
        type: JOB_TYPES.PRIVACY_RETENTION_PURGE,
        idempotencyKey: `${JOB_TYPES.PRIVACY_RETENTION_PURGE}:${hospital.id}:${windowKey}`,
        payload: { window: windowKey },
        maxAttempts: 5,
      });
    }
  }
}
