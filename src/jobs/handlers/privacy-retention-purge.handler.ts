import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../job-handler.types';
import { JOB_TYPES } from '../job-types.constants';
import {
  PrivacyRetentionPurgeResult,
  PrivacyRetentionService,
} from '../../privacy/privacy-retention.service';

@Injectable()
export class PrivacyRetentionPurgeHandler {
  private readonly logger = new Logger(PrivacyRetentionPurgeHandler.name);

  constructor(private readonly privacyRetentionService: PrivacyRetentionService) {}

  async handle(
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<PrivacyRetentionPurgeResult> {
    if (job.type !== JOB_TYPES.PRIVACY_RETENTION_PURGE) {
      throw new Error(`Unexpected job type for privacy retention handler: ${job.type}`);
    }

    const started = Date.now();
    const result = await this.privacyRetentionService.purgeForHospital(
      job.hospitalId,
      { jobId: job.id },
    );

    this.logger.log(
      JSON.stringify({
        event: 'privacy_retention_job_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        hospitalId: job.hospitalId,
        skipped: result.skipped,
        auditLogsDeleted: result.auditLogsDeleted,
        whatsAppMessagesDeleted: result.whatsAppMessagesDeleted,
        notificationsDeleted: result.notificationsDeleted,
        durationMs: Date.now() - started,
      }),
    );

    return result;
  }
}
