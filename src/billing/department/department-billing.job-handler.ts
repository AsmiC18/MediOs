import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../../jobs/job-handler.types';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DepartmentBillingProcessService } from './department-billing-process.service';

export type DepartmentBillingJobPayload = {
  outboxId: string;
};

@Injectable()
export class DepartmentBillingJobHandler {
  private readonly logger = new Logger(DepartmentBillingJobHandler.name);

  constructor(
    private readonly departmentBillingProcessService: DepartmentBillingProcessService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.BILLING_DEPARTMENT_PROCESS) {
      throw new Error(
        `Unexpected job type for department billing handler: ${job.type}`,
      );
    }

    const payload = job.payload as DepartmentBillingJobPayload;
    const outboxId = payload?.outboxId;
    if (!outboxId || typeof outboxId !== 'string') {
      throw new Error('Department billing job payload must include outboxId');
    }

    const started = Date.now();
    const result =
      await this.departmentBillingProcessService.processOutboxEvent(
        job.hospitalId,
        outboxId,
        { jobId: job.id, workerId: workerContext.workerId },
      );

    this.logger.log(
      JSON.stringify({
        event: 'department_billing_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        outboxId,
        outcome: result.outcome,
        durationMs: Date.now() - started,
      }),
    );
  }
}
