import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../../jobs/job-handler.types';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { PharmacyInventoryScanService } from './pharmacy-inventory-scan.service';

type ScanPayload = { window?: string };

@Injectable()
export class PharmacyLowStockScanHandler {
  private readonly logger = new Logger(PharmacyLowStockScanHandler.name);

  constructor(
    private readonly pharmacyInventoryScanService: PharmacyInventoryScanService,
  ) {}

  async handle(job: Job, workerContext: JobExecutionContext): Promise<void> {
    if (job.type !== JOB_TYPES.PHARMACY_LOW_STOCK_SCAN) {
      throw new Error(`Unexpected job type: ${job.type}`);
    }

    const payload = job.payload as ScanPayload;
    const windowKey =
      typeof payload?.window === 'string' ? payload.window : 'unknown';

    const { alertsCreated } =
      await this.pharmacyInventoryScanService.scanLowStock(
        job.hospitalId,
        windowKey,
      );

    this.logger.log(
      JSON.stringify({
        event: 'pharmacy_low_stock_scan_completed',
        jobId: job.id,
        workerId: workerContext.workerId,
        hospitalId: job.hospitalId,
        windowKey,
        alertsCreated,
      }),
    );
  }
}
