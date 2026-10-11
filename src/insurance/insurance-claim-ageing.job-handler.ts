import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { AuditService } from '../audit/audit.service';
import { InsuranceClaimAgeingJobPayload } from './insurance-job.types';

@Injectable()
export class InsuranceClaimAgeingJobHandler {
  private readonly logger = new Logger(InsuranceClaimAgeingJobHandler.name);

  constructor(private readonly auditService: AuditService) {}

  async handle(job: Job, context: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.INSURANCE_CLAIM_AGEING) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = (job.payload ?? {}) as InsuranceClaimAgeingJobPayload;

    await this.auditService.log({
      action: 'INSURANCE_CLAIM_AGEING_JOB_COMPLETED',
      entity: 'InsuranceClaim',
      entityId: job.hospitalId,
      hospitalId: job.hospitalId,
      branchId: job.branchId,
      userId: null,
      metadata: {
        jobId: job.id,
        workerId: context.workerId,
        asOfDate: payload.asOfDate ?? new Date().toISOString(),
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'insurance_claim_ageing_job_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
      }),
    );
  }
}
