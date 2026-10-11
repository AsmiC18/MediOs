import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import {
  AttendanceMonthlySummaryJobPayload,
  AttendanceMonthlySummaryService,
} from './attendance-monthly-summary.service';

@Injectable()
export class AttendanceMonthlySummaryHandler {
  private readonly logger = new Logger(AttendanceMonthlySummaryHandler.name);

  constructor(
    private readonly summaryService: AttendanceMonthlySummaryService,
  ) {}

  async handle(job: Job, _context: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.ATTENDANCE_MONTHLY_SUMMARY) {
      throw new Error(
        `Unexpected job type for attendance monthly summary handler: ${job.type}`,
      );
    }

    const payload = job.payload as AttendanceMonthlySummaryJobPayload;
    const period = this.summaryService.resolvePeriodFromPayload(payload);

    const started = Date.now();
    const result = await this.summaryService.computeForHospital(
      job.hospitalId,
      period,
    );

    this.logger.log(
      JSON.stringify({
        event: 'attendance_monthly_summary_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        periodKey: period.periodKey,
        upserted: result.upserted,
        durationMs: Date.now() - started,
      }),
    );
  }
}
