import { JOB_TYPES } from '../jobs/job-types.constants';

export type BillingPaymentReconcileJobPayload = {
  paymentId: string;
};

export type BillingRefundReconcileJobPayload = {
  refundId: string;
};

export function billingPaymentReconcileIdempotencyKey(
  paymentId: string,
  generation: number,
): string {
  return `${JOB_TYPES.BILLING_PAYMENT_RECONCILE}:${paymentId}:${generation}`;
}

export function billingRefundReconcileIdempotencyKey(
  refundId: string,
  generation: number,
): string {
  return `${JOB_TYPES.BILLING_REFUND_RECONCILE}:${refundId}:${generation}`;
}
