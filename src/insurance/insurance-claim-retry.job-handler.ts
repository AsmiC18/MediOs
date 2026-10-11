import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { JobService } from '../jobs/job.service';
import { InsuranceClaimRetryJobPayload } from './insurance-job.types';

@Injectable()
export class InsuranceClaimRetryJobHandler {
  private readonly logger = new Logger(InsuranceClaimRetryJobHandler.name);

  constructor(private readonly jobService: JobService) {}

  async handle(job: Job, context: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.INSURANCE_CLAIM_RETRY) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as InsuranceClaimRetryJobPayload;
    if (!payload?.claimId) {
      throw new Error('insurance.claim.retry job requires claimId');
    }

    await this.jobService.enqueue({
      hospitalId: job.hospitalId,
      branchId: job.branchId,
      type: JOB_TYPES.INSURANCE_CLAIM_SUBMIT,
      idempotencyKey: `${JOB_TYPES.INSURANCE_CLAIM_SUBMIT}:retry:${payload.claimId}:${job.id}`,
      payload: { claimId: payload.claimId },
      maxAttempts: 5,
    });

    this.logger.log(
      JSON.stringify({
        event: 'insurance_claim_retry_enqueued_submit',
        jobId: job.id,
        claimId: payload.claimId,
        workerId: context.workerId,
      }),
    );
  }
}
