import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../job-types.constants';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcHourWindow } from './scheduler-window.util';

/** Enqueues one consent-expiry job per hospital per UTC hour (enqueue-only). */
@Injectable()
export class AbdmConsentExpireSchedulerTask implements SchedulerTask {
  readonly name = 'abdm-consent-expire';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error('abdm-consent-expire requires hospitalId in scheduler context');
    }

    const windowKey = formatUtcHourWindow(context.tickAt);
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId,
      branchId: null,
      type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
      idempotencyKey: `${JOB_TYPES.ABDM_CONSENT_EXPIRE}:${hospitalId}:${windowKey}`,
      payload: { window: windowKey },
      maxAttempts: 5,
    });
  }
}
