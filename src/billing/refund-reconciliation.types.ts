import { RefundStatus } from '@prisma/client';

/** Refunds awaiting provider outcome (webhook / reconciliation). */
export const REFUND_RECONCILIATION_RESOLVABLE_STATUSES: RefundStatus[] = [
  RefundStatus.PROCESSING,
  RefundStatus.SUBMIT_UNCERTAIN,
];

/** Amounts reserved against remaining refundable balance on the payment. */
export const REFUND_BALANCE_RESERVATION_STATUSES: RefundStatus[] = [
  RefundStatus.REQUESTED,
  RefundStatus.APPROVED,
  RefundStatus.PROCESSING,
  RefundStatus.SUBMIT_UNCERTAIN,
];

export type RefundReconciliationOutcome =
  | 'resolved'
  | 'no_change'
  | 'no_match'
  | 'ambiguous'
  | 'mismatch'
  | 'not_found'
  | 'retryable_error'
  | 'permanent_error';

export type RefundReconciliationContext = {
  jobId?: string;
  workerId?: string;
  source?: 'background_job';
};

export type RefundReconciliationResult = {
  outcome: RefundReconciliationOutcome;
  refundId: string;
  hospitalId: string;
  previousStatus?: RefundStatus;
  newStatus?: RefundStatus;
  message?: string;
  providerRefundId?: string | null;
  providerPaymentId?: string | null;
};
