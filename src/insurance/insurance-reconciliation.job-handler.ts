import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { InsuranceReconciliationJobPayload } from './insurance-job.types';
import { InsuranceReconciliationService } from './insurance-reconciliation.service';

@Injectable()
export class InsuranceReconciliationJobHandler {
  private readonly logger = new Logger(InsuranceReconciliationJobHandler.name);

  constructor(
    private readonly reconciliationService: InsuranceReconciliationService,
  ) {}

  async handle(job: Job, context: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.INSURANCE_RECONCILIATION) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = (job.payload ?? {}) as InsuranceReconciliationJobPayload;

    const result = await this.reconciliationService.runInternalReconciliation({
      hospitalId: job.hospitalId,
      branchId: payload.branchId ?? job.branchId,
      jobId: job.id,
      workerId: context.workerId,
    });

    this.logger.log(
      JSON.stringify({
        event: 'insurance_reconciliation_job_completed',
        jobId: job.id,
        findingCount: result.findingCount,
      }),
    );
  }
}
