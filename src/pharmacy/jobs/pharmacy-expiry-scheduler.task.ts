import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { loadJobSchedulerConfig } from '../../jobs/scheduler/job-scheduler.config';
import { SchedulerExecutionContext, SchedulerTask } from '../../jobs/scheduler/scheduler.types';
import { formatUtcDayWindow } from '../../jobs/scheduler/scheduler-window.util';

@Injectable()
export class PharmacyExpirySchedulerTask implements SchedulerTask {
  readonly name = 'pharmacy-expiry-scan';
  readonly requiresTestHospitalId = false;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.pharmacyExpirySchedulerEnabled) {
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
        type: JOB_TYPES.PHARMACY_EXPIRY_SCAN,
        idempotencyKey: `${JOB_TYPES.PHARMACY_EXPIRY_SCAN}:${hospital.id}:${windowKey}`,
        payload: { window: windowKey },
        maxAttempts: 5,
      });
    }
  }
}
