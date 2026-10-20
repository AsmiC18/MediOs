import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { loadJobSchedulerConfig } from '../../jobs/scheduler/job-scheduler.config';
import { SchedulerExecutionContext, SchedulerTask } from '../../jobs/scheduler/scheduler.types';
import { formatUtcDayWindow } from '../../jobs/scheduler/scheduler-window.util';

@Injectable()
export class PharmacyExpirySchedulerTask implements SchedulerTask {
  readonly name = 'pharmacy-expiry-scan';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.pharmacyExpirySchedulerEnabled) {
      return;
    }

    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'pharmacy-expiry-scan requires hospitalId in scheduler context',
      );
    }

    const windowKey = formatUtcDayWindow(context.tickAt);
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId,
      branchId: null,
      type: JOB_TYPES.PHARMACY_EXPIRY_SCAN,
      idempotencyKey: `${JOB_TYPES.PHARMACY_EXPIRY_SCAN}:${hospitalId}:${windowKey}`,
      payload: { window: windowKey },
      maxAttempts: 5,
    });
  }
}
