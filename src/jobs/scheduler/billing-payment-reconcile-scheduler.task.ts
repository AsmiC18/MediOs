import { Injectable } from '@nestjs/common';
import {
  loadPaymentReconcileJobHistoriesByPaymentId,
  tryEnqueuePaymentReconcileIfEligible,
} from '../../billing/billing-reconciliation-scheduler.util';
import { PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES } from '../../billing/payment-reconciliation.types';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';

/** Enqueues payment reconciliation jobs for unresolved payments (enqueue-only). */
@Injectable()
export class BillingPaymentReconcileSchedulerTask implements SchedulerTask {
  readonly name = 'billing-payment-reconcile';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'billing-payment-reconcile requires hospitalId in scheduler context',
      );
    }

    const payments = await context.transaction.payment.findMany({
      where: {
        hospitalId,
        status: { in: PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES },
      },
      select: { id: true, hospitalId: true },
      orderBy: { id: 'asc' },
    });

    const historyByPaymentId = await loadPaymentReconcileJobHistoriesByPaymentId(
      context.transaction,
      hospitalId,
      payments.map((payment) => payment.id),
    );

    for (const payment of payments) {
      await tryEnqueuePaymentReconcileIfEligible(
        context,
        payment.hospitalId,
        payment.id,
        historyByPaymentId.get(payment.id),
      );
    }
  }
}
