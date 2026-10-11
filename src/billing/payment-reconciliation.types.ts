import { PaymentStatus } from '@prisma/client';

export const PAYMENT_RECONCILIATION_RESOLVABLE_STATUSES: PaymentStatus[] = [
  PaymentStatus.INITIATED,
  PaymentStatus.PENDING,
  PaymentStatus.SUBMIT_UNCERTAIN,
];

export type PaymentReconciliationOutcome =
  | 'resolved'
  | 'no_change'
  | 'no_match'
  | 'ambiguous'
  | 'mismatch'
  | 'retryable_error'
  | 'permanent_error'
  | 'not_found';

export type PaymentReconciliationContext = {
  jobId?: string;
  workerId?: string;
  source?: 'background_job';
};

export type PaymentReconciliationResult = {
  outcome: PaymentReconciliationOutcome;
  paymentId: string;
  hospitalId: string;
  previousStatus?: PaymentStatus;
  newStatus?: PaymentStatus;
  message?: string;
  providerPaymentLinkId?: string | null;
  providerPaymentId?: string | null;
};
