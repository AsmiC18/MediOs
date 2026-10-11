import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { RazorpayService } from './razorpay.service';

describe('PaymentsService Razorpay webhook (unit)', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const invoiceId = 'invoice-1';
  const paymentId = 'payment-1';

  let prisma: {
    $transaction: jest.Mock;
    payment: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    invoice: { findUnique: jest.Mock };
    paymentWebhookEvent: { create: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let paymentsService: PaymentsService;
  let splitPayer: ReturnType<typeof createMockInvoiceSplitPayerService>;

  const pendingPayment = {
    id: paymentId,
    hospitalId,
    branchId,
    invoiceId,
    status: PaymentStatus.PENDING,
    amount: new Prisma.Decimal(500),
    currency: 'INR',
    provider: PaymentProvider.RAZORPAY,
    providerPaymentId: null,
    providerOrderId: 'order_webhook_1',
    providerPaymentLinkId: null,
  };

  const invoice = {
    id: invoiceId,
    hospitalId,
    branchId,
    status: InvoiceStatus.ISSUED,
    currency: 'INR',
    totalAmount: new Prisma.Decimal(500),
  };

  function signedPayload(body: object) {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
    const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    const signature = require('crypto')
      .createHmac('sha256', 'whsec_test')
      .update(rawBody)
      .digest('hex');
    return { rawBody, signature };
  }

  beforeEach(() => {
    splitPayer = createMockInvoiceSplitPayerService();
    prisma = {
      $transaction: jest.fn(async (fn) => fn(prisma)),
      payment: {
        findFirst: jest.fn().mockResolvedValue(pendingPayment),
        findUnique: jest.fn().mockResolvedValue(pendingPayment),
        update: jest.fn().mockResolvedValue({
          ...pendingPayment,
          status: PaymentStatus.SUCCEEDED,
        }),
      },
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      paymentWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
      paymentCheckoutIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const razorpayService = { createPaymentLink: jest.fn(), createRefund: jest.fn() };
    const refundsService = new RefundsService(
      prisma as never,
      auditService as never,
      razorpayService as never,
      splitPayer,
    );
    paymentsService = new PaymentsService(
      prisma as never,
      auditService as never,
      razorpayService as never,
      refundsService,
      splitPayer,
    );
  });

  it('marks duplicate provider events as processed without updating payment', async () => {
    const body = {
      id: 'evt_dup',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 50000,
            currency: 'INR',
            order_id: 'order_webhook_1',
          },
        },
      },
    };
    const { rawBody, signature } = signedPayload(body);
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.paymentWebhookEvent.create.mockRejectedValueOnce(p2002);

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

    expect(result).toEqual({ processed: true, duplicate: true });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('returns amount_mismatch outcome when provider amount differs', async () => {
    const body = {
      id: 'evt_mismatch',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 100,
            currency: 'INR',
            order_id: 'order_webhook_1',
          },
        },
      },
    };
    const { rawBody, signature } = signedPayload(body);

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

    expect(result).toEqual(
      expect.objectContaining({ processed: true, outcome: 'amount_mismatch' }),
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('ignores success webhook when payment already succeeded', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      ...pendingPayment,
      status: PaymentStatus.SUCCEEDED,
    });
    const body = {
      id: 'evt_already',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 50000,
            currency: 'INR',
            order_id: 'order_webhook_1',
          },
        },
      },
    };
    const { rawBody, signature } = signedPayload(body);

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

    expect(result.outcome).toBe('ignored');
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it.each([
    ['payment_link.paid', 'payment_link', 'plink_1'],
    ['payment.captured', 'payment', 'order_webhook_1'],
  ] as const)(
    'processes success webhook for %s',
    async (event, entityKey, entityId) => {
      const body =
        entityKey === 'payment_link'
          ? {
              id: `evt_${event}`,
              event,
              payload: {
                payment_link: {
                  entity: {
                    id: entityId,
                    amount: 50000,
                    currency: 'INR',
                    reference_id: paymentId,
                  },
                },
                payment: {
                  entity: {
                    id: 'pay_success',
                    amount: 50000,
                    currency: 'INR',
                    order_id: 'order_webhook_1',
                  },
                },
              },
            }
          : {
              id: `evt_${event}`,
              event,
              payload: {
                payment: {
                  entity: {
                    id: 'pay_1',
                    amount: 50000,
                    currency: 'INR',
                    order_id: entityId,
                  },
                },
              },
            };

      if (entityKey === 'payment_link') {
        prisma.payment.findFirst.mockResolvedValue({
          ...pendingPayment,
          providerPaymentLinkId: entityId,
          providerOrderId: null,
        });
      }

      const { rawBody, signature } = signedPayload(body);
      const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

      expect(result).toEqual(
        expect.objectContaining({ processed: true, duplicate: false }),
      );
      expect(prisma.payment.update).toHaveBeenCalled();
    },
  );

  it('marks payment failed on payment.failed webhook', async () => {
    const body = {
      id: 'evt_fail',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 50000,
            currency: 'INR',
            order_id: 'order_webhook_1',
          },
        },
      },
    };
    const { rawBody, signature } = signedPayload(body);
    prisma.payment.update.mockResolvedValue({
      ...pendingPayment,
      status: PaymentStatus.FAILED,
    });

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

    expect(result).toEqual(
      expect.objectContaining({ processed: true, outcome: 'failed' }),
    );
    expect(prisma.payment.update).toHaveBeenCalled();
  });

  it('records ignored outcome for unsupported payment events', async () => {
    const body = {
      id: 'evt_authorized',
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            amount: 50000,
            currency: 'INR',
            order_id: 'order_webhook_1',
          },
        },
      },
    };
    const { rawBody, signature } = signedPayload(body);

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);

    expect(result).toEqual(
      expect.objectContaining({ processed: true, outcome: 'ignored' }),
    );
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ignored: true,
          eventType: 'payment.authorized',
        }),
      }),
    );
  });
});
