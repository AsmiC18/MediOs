import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../../jobs/job-handler.types';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { loadJobSchedulerConfig } from '../../jobs/scheduler/job-scheduler.config';
import { PharmacyInventoryScanService } from './pharmacy-inventory-scan.service';

type ScanPayload = { window?: string };

@Injectable()
export class PharmacyExpiryScanHandler {
  private readonly logger = new Logger(PharmacyExpiryScanHandler.name);

  constructor(
    private readonly pharmacyInventoryScanService: PharmacyInventoryScanService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PHARMACY_EXPIRY_SCAN) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as ScanPayload;
    const windowKey =
      typeof payload?.window === 'string' ? payload.window : 'unknown';
    const warningDays = loadJobSchedulerConfig().pharmacyExpiryWarningDays;

    const { alertsCreated } =
      await this.pharmacyInventoryScanService.scanExpiry(
        job.hospitalId,
        windowKey,
        warningDays,
      );

    this.logger.log(
      JSON.stringify({
        event: 'pharmacy_expiry_scan_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        hospitalId: job.hospitalId,
        windowKey,
        warningDays,
        alertsCreated,
      }),
    );
  }
}
