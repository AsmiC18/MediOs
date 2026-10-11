import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../job-types.constants';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcHourWindow } from './scheduler-window.util';

/** Enqueues one consent-expiry job per hospital per UTC hour (enqueue-only). */
@Injectable()
export class AbdmConsentExpireSchedulerTask implements SchedulerTask {
  readonly name = 'abdm-consent-expire';
  readonly requiresTestHospitalId = false;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const windowKey = formatUtcHourWindow(context.tickAt);
    const hospitals = await context.transaction.hospital.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const hospital of hospitals) {
      await context.jobService.enqueueWithClient(context.transaction, {
        hospitalId: hospital.id,
        branchId: null,
        type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
        idempotencyKey: `${JOB_TYPES.ABDM_CONSENT_EXPIRE}:${hospital.id}:${windowKey}`,
        payload: { window: windowKey },
        maxAttempts: 5,
      });
    }
  }
}
