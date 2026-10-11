import { RazorpayService } from './razorpay.service';
import { RazorpayError } from './razorpay.errors';

describe('RazorpayService read-only wrappers', () => {
  beforeEach(() => {
    process.env.RAZORPAY_MOCK_MODE = 'true';
    process.env.RAZORPAY_KEY_ID = 'key';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
  });

  it('fetchPaymentLink returns mock entity', async () => {
    const service = new RazorpayService();
    const result = await service.fetchPaymentLink('plink_test');
    expect(result.id).toBe('plink_test');
  });

  it('createPaymentLink supports mock ambiguous failure', async () => {
    const service = new RazorpayService();
    await expect(
      service.createPaymentLink({
        paymentId: '11111111-1111-4111-8111-111111111111',
        invoiceNumber: 'INV-1',
        amount: '100.00',
        currency: 'INR',
        mockFail: 'ambiguous',
      }),
    ).rejects.toMatchObject({ kind: 'ambiguous' } satisfies Partial<RazorpayError>);
  });

  it('createRefund supports mock permanent failure', async () => {
    const service = new RazorpayService();
    await expect(
      service.createRefund({
        refundId: '22222222-2222-4222-8222-222222222222',
        providerPaymentId: 'pay_1',
        amount: '10.00',
        currency: 'INR',
        reason: 'MOCK_REFUND_FAIL',
      }),
    ).rejects.toMatchObject({ kind: 'permanent' });
  });
});
