import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { PharmacyDispensingBillingService } from './pharmacy-dispensing-billing.service';

type PharmacyDispensingBillingJobPayload = {
  outboxId?: string;
};

@Injectable()
export class PharmacyDispensingBillingJobHandler {
  private readonly logger = new Logger(PharmacyDispensingBillingJobHandler.name);

  constructor(
    private readonly pharmacyDispensingBillingService: PharmacyDispensingBillingService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PHARMACY_DISPENSING_BILLING) {
      throw new Error(
        `Unexpected job type for pharmacy dispensing billing: ${job.type}`,
      );
    }

    const payload = job.payload as PharmacyDispensingBillingJobPayload;
    const outboxId = payload?.outboxId;

    if (!outboxId) {
      throw new Error('Pharmacy dispensing billing job requires outboxId');
    }

    const result =
      await this.pharmacyDispensingBillingService.processOutboxEvent(
        job.hospitalId,
        outboxId,
        { jobId: job.id, workerId: workerContext.workerId },
      );

    this.logger.log(
      JSON.stringify({
        event: 'pharmacy_dispensing_billing_completed',
        jobId: job.id,
        hospitalId: job.hospitalId,
        outboxId,
        outcome: result.outcome,
        invoiceId: result.invoiceId,
      }),
    );
  }
}
