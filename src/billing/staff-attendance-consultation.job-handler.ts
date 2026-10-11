import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { StaffAttendanceConsultationService } from './staff-attendance-consultation.service';

export type StaffAttendanceConsultationJobPayload = {
  outboxId: string;
};

@Injectable()
export class StaffAttendanceConsultationJobHandler {
  private readonly logger = new Logger(StaffAttendanceConsultationJobHandler.name);

  constructor(
    private readonly consultationService: StaffAttendanceConsultationService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.STAFF_ATTENDANCE_CONSULTATION) {
      throw new Error(
        `Unexpected job type for staff attendance consultation handler: ${job.type}`,
      );
    }

    const payload = job.payload as StaffAttendanceConsultationJobPayload;
    const outboxId = payload?.outboxId;
    if (!outboxId || typeof outboxId !== 'string') {
      throw new Error(
        'Staff attendance consultation job payload must include outboxId',
      );
    }

    const started = Date.now();
    const result = await this.consultationService.processOutboxEvent(
      job.hospitalId,
      outboxId,
      { jobId: job.id, workerId: workerContext.workerId },
    );

    this.logger.log(
      JSON.stringify({
        event: 'staff_attendance_consultation_billing_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        outboxId,
        outcome: result.outcome,
        durationMs: Date.now() - started,
      }),
    );
  }
}
