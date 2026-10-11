import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../job-types.constants';
import { loadJobSchedulerConfig } from './job-scheduler.config';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import { formatUtcDayWindow } from './scheduler-window.util';

/** Enqueues one patient at-risk evaluation job per hospital per UTC day (enqueue-only). */
@Injectable()
export class PatientAtRiskSchedulerTask implements SchedulerTask {
  readonly name = 'patient-at-risk-evaluate';
  readonly requiresTestHospitalId = false;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.patientAtRiskSchedulerEnabled) {
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
        type: JOB_TYPES.PATIENT_AT_RISK_EVALUATE,
        idempotencyKey: `${JOB_TYPES.PATIENT_AT_RISK_EVALUATE}:${hospital.id}:${windowKey}`,
        payload: { window: windowKey },
        maxAttempts: 5,
      });
    }
  }
}
