import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { InsuranceClaimExternalService } from './insurance-claim-external.service';
import { InsuranceClaimSubmitJobPayload } from './insurance-job.types';

@Injectable()
export class InsuranceClaimSubmitJobHandler {
  private readonly logger = new Logger(InsuranceClaimSubmitJobHandler.name);

  constructor(
    private readonly claimExternalService: InsuranceClaimExternalService,
  ) {}

  async handle(job: Job, context: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.INSURANCE_CLAIM_SUBMIT) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as InsuranceClaimSubmitJobPayload;
    if (!payload?.claimId) {
      throw new Error('insurance.claim.submit job requires claimId');
    }

    const result = await this.claimExternalService.processClaimSubmitJob({
      hospitalId: job.hospitalId,
      claimId: payload.claimId,
      jobId: job.id,
      workerId: context.workerId,
    });

    this.logger.log(
      JSON.stringify({
        event: 'insurance_claim_submit_job_completed',
        jobId: job.id,
        claimId: payload.claimId,
        outcome: result.outcome,
      }),
    );
  }
}
