import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { RefundReconciliationService } from './refund-reconciliation.service';
import {
  RefundReconciliationContext,
  RefundReconciliationResult,
} from './refund-reconciliation.types';
import { BillingRefundReconcileJobPayload } from './reconciliation-job.types';

@Injectable()
export class RefundReconciliationJobHandler {
  private readonly logger = new Logger(RefundReconciliationJobHandler.name);

  constructor(
    private readonly refundReconciliationService: RefundReconciliationService,
  ) {}

  async handle(
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<RefundReconciliationResult> {
    if (job.type !== JOB_TYPES.BILLING_REFUND_RECONCILE) {
      throw new Error(
        `Unexpected job type for refund reconciliation handler: ${job.type}`,
      );
    }

    const payload = job.payload as BillingRefundReconcileJobPayload;
    const refundId = payload?.refundId;
    if (!refundId || typeof refundId !== 'string') {
      throw new Error('Refund reconcile job payload must include refundId');
    }

    const reconciliationContext: RefundReconciliationContext = {
      jobId: job.id,
      workerId: workerContext.workerId,
      source: 'background_job',
    };

    const started = Date.now();
    const result = await this.refundReconciliationService.reconcileRefund(
      refundId,
      job.hospitalId,
      reconciliationContext,
    );

    this.logger.log(
      JSON.stringify({
        event: 'billing_refund_reconcile_completed',
        jobId: job.id,
        jobType: job.type,
        hospitalId: job.hospitalId,
        refundId,
        workerId: workerContext.workerId,
        outcome: result.outcome,
        durationMs: Date.now() - started,
      }),
    );

    return result;
  }
}
