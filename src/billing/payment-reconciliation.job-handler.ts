import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@prisma/client';
import { JobExecutionContext } from '../jobs/job-handler.types';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { SystemJobExecutionContext } from '../jobs/system-job.types';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import {
  PaymentReconciliationContext,
  PaymentReconciliationResult,
} from './payment-reconciliation.types';
import { BillingPaymentReconcileJobPayload } from './reconciliation-job.types';

@Injectable()
export class PaymentReconciliationJobHandler {
  private readonly logger = new Logger(PaymentReconciliationJobHandler.name);

  constructor(
    private readonly paymentReconciliationService: PaymentReconciliationService,
  ) {}

  async handle(
    job: Job,
    workerContext: JobExecutionContext,
  ): Promise<PaymentReconciliationResult> {
    if (job.type !== JOB_TYPES.BILLING_PAYMENT_RECONCILE) {
      throw new Error(
        `Unexpected job type for payment reconciliation handler: ${job.type}`,
      );
    }

    const payload = job.payload as BillingPaymentReconcileJobPayload;
    const paymentId = payload?.paymentId;
    if (!paymentId || typeof paymentId !== 'string') {
      throw new Error('Payment reconcile job payload must include paymentId');
    }

    const reconciliationContext: PaymentReconciliationContext = {
      jobId: job.id,
      workerId: workerContext.workerId,
      source: 'background_job',
    };

    const started = Date.now();
    const result = await this.paymentReconciliationService.reconcilePayment(
      paymentId,
      job.hospitalId,
      reconciliationContext,
    );

    this.logger.log(
      JSON.stringify({
        event: 'billing_payment_reconcile_completed',
        jobId: job.id,
        jobType: job.type,
        hospitalId: job.hospitalId,
        paymentId,
        workerId: workerContext.workerId,
        outcome: result.outcome,
        durationMs: Date.now() - started,
      }),
    );

    return result;
  }
}
