import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { loadJobSchedulerConfig } from '../../jobs/scheduler/job-scheduler.config';
import { SchedulerExecutionContext, SchedulerTask } from '../../jobs/scheduler/scheduler.types';
import { formatUtcDayWindow } from '../../jobs/scheduler/scheduler-window.util';

@Injectable()
export class PharmacyLowStockSchedulerTask implements SchedulerTask {
  readonly name = 'pharmacy-low-stock-scan';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.pharmacyLowStockSchedulerEnabled) {
      return;
    }

    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'pharmacy-low-stock-scan requires hospitalId in scheduler context',
      );
    }

    const windowKey = formatUtcDayWindow(context.tickAt);
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId,
      branchId: null,
      type: JOB_TYPES.PHARMACY_LOW_STOCK_SCAN,
      idempotencyKey: `${JOB_TYPES.PHARMACY_LOW_STOCK_SCAN}:${hospitalId}:${windowKey}`,
      payload: { window: windowKey },
      maxAttempts: 5,
    });
  }
}
