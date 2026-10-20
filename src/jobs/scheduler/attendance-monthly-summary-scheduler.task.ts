import { Injectable } from '@nestjs/common';
import { JOB_TYPES } from '../job-types.constants';
import { loadJobSchedulerConfig } from './job-scheduler.config';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';
import {
  monthlySummaryJobIdempotencyKey,
  resolvePreviousUtcCalendarMonth,
} from '../../attendance/attendance-monthly-summary.util';

/** Enqueues one attendance monthly summary job per hospital for the previous UTC month. */
@Injectable()
export class AttendanceMonthlySummarySchedulerTask implements SchedulerTask {
  readonly name = 'attendance-monthly-summary';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.attendanceMonthlySummarySchedulerEnabled) {
      return;
    }

    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'attendance-monthly-summary requires hospitalId in scheduler context',
      );
    }

    const period = resolvePreviousUtcCalendarMonth(context.tickAt);
    await context.jobService.enqueueWithClient(context.transaction, {
      hospitalId,
      branchId: null,
      type: JOB_TYPES.ATTENDANCE_MONTHLY_SUMMARY,
      idempotencyKey: monthlySummaryJobIdempotencyKey(hospitalId, period.periodKey),
      payload: {
        periodKey: period.periodKey,
        periodYear: period.periodYear,
        periodMonth: period.periodMonth,
      },
      maxAttempts: 5,
    });
  }
}
