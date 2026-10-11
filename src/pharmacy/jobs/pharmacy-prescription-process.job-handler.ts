import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../../jobs/job-handler.types';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { PharmacyPrescriptionProcessService } from './pharmacy-prescription-process.service';

export type PharmacyPrescriptionProcessJobPayload = {
  outboxId: string;
};

@Injectable()
export class PharmacyPrescriptionProcessJobHandler {
  private readonly logger = new Logger(PharmacyPrescriptionProcessJobHandler.name);

  constructor(
    private readonly pharmacyPrescriptionProcessService: PharmacyPrescriptionProcessService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS) {
      throw new Error(
        `Unexpected job type for pharmacy prescription handler: ${job.type}`,
      );
    }

    const payload = job.payload as PharmacyPrescriptionProcessJobPayload;
    const outboxId = payload?.outboxId;
    if (!outboxId || typeof outboxId !== 'string') {
      throw new Error(
        'Pharmacy prescription process job payload must include outboxId',
      );
    }

    const started = Date.now();
    const result =
      await this.pharmacyPrescriptionProcessService.processOutboxEvent(
        job.hospitalId,
        outboxId,
      );

    this.logger.log(
      JSON.stringify({
        event: 'pharmacy_prescription_process_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        hospitalId: job.hospitalId,
        outboxId,
        outcome: result.outcome,
        workItemId: result.workItemId,
        durationMs: Date.now() - started,
      }),
    );
  }
}
