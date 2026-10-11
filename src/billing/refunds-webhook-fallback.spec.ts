import { Prisma, RefundStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';

import { RefundsService } from './refunds.service';

import { RazorpayService } from './razorpay.service';



describe('RefundsService uncertain webhook fallback', () => {

  const hospitalId = '11111111-1111-4111-8111-111111111111';

  const providerPaymentId = 'pay_uncertain_fallback';



  let prisma: {

    refund: { findFirst: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };

    paymentWebhookEvent: { create: jest.Mock };

    payment: { findUnique: jest.Mock };

    $transaction: jest.Mock;

  };

  let auditService: { log: jest.Mock };

  let refundsService: RefundsService;



  const payload = {

    event: 'refund.processed',

    payload: {

      refund: {

        entity: {

          id: 'rfnd_from_webhook',

          payment_id: providerPaymentId,

          amount: 10000,

          currency: 'INR',

        },

      },

    },

  };



  beforeEach(() => {

    prisma = {

      refund: {

        findFirst: jest.fn().mockResolvedValue(null),

        findMany: jest.fn(),

        updateMany: jest.fn().mockResolvedValue({ count: 1 }),

      },

      paymentWebhookEvent: {

        create: jest.fn().mockResolvedValue(undefined),

      },

      payment: {

        findUnique: jest.fn().mockResolvedValue({ invoiceId: 'invoice-1' }),

      },

      invoice: {

        findUnique: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          status: 'ISSUED',
          hospitalId: 'hospital-1',
          branchId: null,
        }),

      },

      $transaction: jest.fn(async (fn) => fn(prisma)),

    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    refundsService = new RefundsService(

      prisma as never,

      auditService as never,

      {} as RazorpayService,

      { syncInvoiceSettlementStatus: jest.fn(), computeBalancesForInvoice: jest.fn() } as never,

    );

  });



  it('returns not found when there are zero uncertain candidates', async () => {

    prisma.refund.findMany.mockResolvedValue([]);



    const result = await refundsService.processRefundWebhook(

      payload,

      'evt_zero',

      'refund.processed',

    );



    expect(result).toEqual({ processed: false, reason: 'refund_not_found' });

    expect(prisma.refund.updateMany).not.toHaveBeenCalled();

  });



  it('resolves when exactly one uncertain candidate exists', async () => {

    const refund = {

      id: 'refund-one',

      hospitalId,

      branchId: null,

      paymentId: 'payment-1',

      amount: new Prisma.Decimal(100),

      currency: 'INR',

      status: RefundStatus.SUBMIT_UNCERTAIN,

      providerPaymentId,

      providerRefundId: null,

    };

    prisma.refund.findMany.mockResolvedValue([refund]);



    const result = await refundsService.processRefundWebhook(

      payload,

      'evt_one',

      'refund.processed',

    );



    expect(result.processed).toBe(true);

    expect(prisma.refund.updateMany).toHaveBeenCalled();

  });



  it('does not update any refund when multiple uncertain candidates exist', async () => {

    prisma.refund.findMany.mockResolvedValue([

      {

        id: 'refund-a',

        hospitalId,

        status: RefundStatus.SUBMIT_UNCERTAIN,

        providerPaymentId,

      },

      {

        id: 'refund-b',

        hospitalId,

        status: RefundStatus.SUBMIT_UNCERTAIN,

        providerPaymentId,

      },

    ]);



    const result = await refundsService.processRefundWebhook(

      payload,

      'evt_multi',

      'refund.processed',

    );



    expect(result).toEqual({

      processed: false,

      reason: 'refund_ambiguous_uncertain',

    });

    expect(prisma.paymentWebhookEvent.create).not.toHaveBeenCalled();

    expect(prisma.refund.updateMany).not.toHaveBeenCalled();

    expect(auditService.log).toHaveBeenCalledWith(

      expect.objectContaining({

        action: 'REFUND_WEBHOOK_PROCESSED',

        metadata: expect.objectContaining({

          rejected: true,

          reason: 'ambiguous_uncertain_refund',

          candidateRefundIds: ['refund-a', 'refund-b'],

          providerPaymentId,

        }),

      }),

    );

  });



  it('still resolves by providerRefundId when present', async () => {

    const refund = {

      id: 'refund-by-provider-id',

      hospitalId,

      branchId: null,

      paymentId: 'payment-1',

      amount: new Prisma.Decimal(100),

      currency: 'INR',

      status: RefundStatus.PROCESSING,

      providerPaymentId,

      providerRefundId: 'rfnd_from_webhook',

    };

    prisma.refund.findFirst.mockResolvedValue(refund);



    const result = await refundsService.processRefundWebhook(

      payload,

      'evt_provider_id',

      'refund.processed',

    );



    expect(result.processed).toBe(true);

    expect(prisma.refund.findMany).not.toHaveBeenCalled();

  });

});


