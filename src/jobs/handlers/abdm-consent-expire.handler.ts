import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { AbdmConsentService } from '../../abdm/abdm-consent.service';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';
import { SystemJobExecutionContext } from '../system-job.types';

export type ConsentExpireHandlerResult = {
  expiredCount: number;
};

@Injectable()
export class AbdmConsentExpireHandler {
  private readonly logger = new Logger(AbdmConsentExpireHandler.name);

  constructor(private readonly consentService: AbdmConsentService) {}

  async handle(
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<ConsentExpireHandlerResult> {
    if (job.type !== JOB_TYPES.ABDM_CONSENT_EXPIRE) {
      throw new Error(`Unexpected job type for consent expiry handler: ${job.type}`);
    }

    const systemContext: SystemJobExecutionContext = {
      jobId: job.id,
      jobType: job.type,
      workerId: workerContext.workerId,
      hospitalId: job.hospitalId,
      branchId: job.branchId,
    };

    const started = Date.now();
    const expiredCount =
      await this.consentService.expireExpiredConsentsForSystemJob(systemContext);

    this.logger.log(
      JSON.stringify({
        event: 'abdm_consent_expire_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        branchId: job.branchId,
        expiredCount,
        durationMs: Date.now() - started,
      }),
    );

    return { expiredCount };
  }
}
