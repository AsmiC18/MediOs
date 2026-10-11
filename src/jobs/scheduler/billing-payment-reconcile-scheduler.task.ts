import { Injectable } from '@nestjs/common';
import { tryEnqueuePaymentReconcileIfEligible } from '../../billing/billing-reconciliation-scheduler.util';
import { PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES } from '../../billing/payment-reconciliation.types';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';

/** Enqueues payment reconciliation jobs for unresolved payments (enqueue-only). */
@Injectable()
export class BillingPaymentReconcileSchedulerTask implements SchedulerTask {
  readonly name = 'billing-payment-reconcile';
  readonly requiresTestHospitalId = false;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const hospitals = await context.transaction.hospital.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const hospital of hospitals) {
      const payments = await context.transaction.payment.findMany({
        where: {
          hospitalId: hospital.id,
          status: { in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES },
        },
        select: { id: true, hospitalId: true },
        orderBy: { id: 'asc' },
      });

      for (const payment of payments) {
        await tryEnqueuePaymentReconcileIfEligible(
          context,
          payment.hospitalId,
          payment.id,
        );
      }
    }
  }
}
