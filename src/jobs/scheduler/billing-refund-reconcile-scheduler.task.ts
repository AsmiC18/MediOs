import { Injectable } from '@nestjs/common';
import {
  loadRefundReconcileJobHistoriesByRefundId,
  tryEnqueueRefundReconcileIfEligible,
} from '../../billing/billing-reconciliation-scheduler.util';
import { REFUND_RECONCILIATION_RESOLVABLE_STATUSES } from '../../billing/refund-reconciliation.types';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';

/** Enqueues refund reconciliation jobs for unresolved refunds (enqueue-only). */
@Injectable()
export class BillingRefundReconcileSchedulerTask implements SchedulerTask {
  readonly name = 'billing-refund-reconcile';
  readonly requiresTestHospitalId = false;
  readonly usesPerHospitalTransactions = true;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const hospitalId = context.hospitalId;
    if (!hospitalId) {
      throw new Error(
        'billing-refund-reconcile requires hospitalId in scheduler context',
      );
    }

    const refunds = await context.transaction.refund.findMany({
      where: {
        hospitalId,
        status: { in: REFUND_RECONCILIATION_RESOLVABLE_STATUSES },
      },
      select: { id: true, hospitalId: true },
      orderBy: { id: 'asc' },
    });

    const historyByRefundId = await loadRefundReconcileJobHistoriesByRefundId(
      context.transaction,
      hospitalId,
      refunds.map((refund) => refund.id),
    );

    for (const refund of refunds) {
      await tryEnqueueRefundReconcileIfEligible(
        context,
        refund.hospitalId,
        refund.id,
        historyByRefundId.get(refund.id),
      );
    }
  }
}
