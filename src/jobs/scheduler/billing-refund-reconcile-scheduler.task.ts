import { Injectable } from '@nestjs/common';
import { tryEnqueueRefundReconcileIfEligible } from '../../billing/billing-reconciliation-scheduler.util';
import { REFUND_RECONCILIATION_RESOLVABLE_STATUSES } from '../../billing/refund-reconciliation.types';
import { SchedulerExecutionContext, SchedulerTask } from './scheduler.types';

/** Enqueues refund reconciliation jobs for unresolved refunds (enqueue-only). */
@Injectable()
export class BillingRefundReconcileSchedulerTask implements SchedulerTask {
  readonly name = 'billing-refund-reconcile';
  readonly requiresTestHospitalId = false;

  async run(context: SchedulerExecutionContext): Promise<void> {
    const hospitals = await context.transaction.hospital.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const hospital of hospitals) {
      const refunds = await context.transaction.refund.findMany({
        where: {
          hospitalId: hospital.id,
          status: { in: REFUND_RECONCILIATION_RESOLVABLE_STATUSES },
        },
        select: { id: true, hospitalId: true },
        orderBy: { id: 'asc' },
      });

      for (const refund of refunds) {
        await tryEnqueueRefundReconcileIfEligible(
          context,
          refund.hospitalId,
          refund.id,
        );
      }
    }
  }
}
