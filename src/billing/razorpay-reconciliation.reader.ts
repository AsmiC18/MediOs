import {
  PaymentEntity,
  PaymentLinkEntity,
  RefundEntity,
} from './razorpay-provider.types';

/**
 * Read-only Razorpay surface for future payment/refund reconciliation.
 * Must not expose payment-link creation, refunds, or other mutating APIs.
 */
export interface RazorpayReconciliationReader {
  fetchPaymentLink(paymentLinkId: string): Promise<PaymentLinkEntity>;
  fetchPayment(paymentId: string): Promise<PaymentEntity>;
  fetchRefund(
    providerPaymentId: string,
    providerRefundId: string,
  ): Promise<RefundEntity>;
  listPaymentLinksByReferenceId(referenceId: string): Promise<PaymentLinkEntity[]>;
  listRefundsForPayment(providerPaymentId: string): Promise<RefundEntity[]>;
}

export const RAZORPAY_RECONCILIATION_READER = Symbol(
  'RAZORPAY_RECONCILIATION_READER',
);
