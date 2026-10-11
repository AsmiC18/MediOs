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

  async run(context: SchedulerExecutionContext): Promise<void> {
    const config = loadJobSchedulerConfig();
    if (!config.attendanceMonthlySummarySchedulerEnabled) {
      return;
    }

    const period = resolvePreviousUtcCalendarMonth(context.tickAt);
    const hospitals = await context.transaction.hospital.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const hospital of hospitals) {
      await context.jobService.enqueueWithClient(context.transaction, {
        hospitalId: hospital.id,
        branchId: null,
        type: JOB_TYPES.ATTENDANCE_MONTHLY_SUMMARY,
        idempotencyKey: monthlySummaryJobIdempotencyKey(
          hospital.id,
          period.periodKey,
        ),
        payload: {
          periodKey: period.periodKey,
          periodYear: period.periodYear,
          periodMonth: period.periodMonth,
        },
        maxAttempts: 5,
      });
    }
  }
}
