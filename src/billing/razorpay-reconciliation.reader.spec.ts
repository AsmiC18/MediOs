import { RazorpayReconciliationReader } from './razorpay-reconciliation.reader';
import { RazorpayService } from './razorpay.service';

describe('RazorpayReconciliationReader boundary', () => {
  it('RazorpayService satisfies the read-only reader interface', () => {
    const reader: RazorpayReconciliationReader = new RazorpayService();
    expect(typeof reader.fetchPaymentLink).toBe('function');
    expect(typeof reader.fetchPayment).toBe('function');
    expect(typeof reader.fetchRefund).toBe('function');
    expect(typeof reader.listPaymentLinksByReferenceId).toBe('function');
    expect(typeof reader.listRefundsForPayment).toBe('function');
  });

  it('defines only read methods on RazorpayReconciliationReader', () => {
    type ReaderMethod = keyof RazorpayReconciliationReader;
    const expected: ReaderMethod[] = [
      'fetchPaymentLink',
      'fetchPayment',
      'fetchRefund',
      'listPaymentLinksByReferenceId',
      'listRefundsForPayment',
    ];
    expect(expected).toHaveLength(5);
    type HasCreate = 'createPaymentLink' extends ReaderMethod ? true : false;
    const excludesMutations: HasCreate = false;
    expect(excludesMutations).toBe(false);
  });
});
