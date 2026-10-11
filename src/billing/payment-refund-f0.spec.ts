import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RefundStatus,
} from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { RazorpayError } from './razorpay.errors';
import { RazorpayService } from './razorpay.service';

describe('Payment and refund F0 uncertain submission', () => {
  describe('unit', () => {
    const hospitalId = '11111111-1111-4111-8111-111111111111';
    const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const invoiceId = 'invoice-1';
    const paymentId = 'payment-1';
    const user = { sub: 'user-1', hospitalId, branchId };

    let prisma: {
      $transaction: jest.Mock;
      $queryRaw: jest.Mock;
      $executeRaw: jest.Mock;
      invoice: { findFirst: jest.Mock };
      payment: {
        findFirst: jest.Mock;
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      refund: {
        findUnique: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        aggregate: jest.Mock;
      };
      paymentWebhookEvent: { create: jest.Mock };
    };
    let razorpayService: {
      createPaymentLink: jest.Mock;
      createRefund: jest.Mock;
    };
    let auditService: { log: jest.Mock };
    let paymentsService: PaymentsService;
    let refundsService: RefundsService;

    const issuedInvoice = {
      id: invoiceId,
      hospitalId,
      branchId,
      invoiceNumber: 'INV-1',
      status: InvoiceStatus.ISSUED,
      currency: 'INR',
      totalAmount: new Prisma.Decimal(500),
    };

    beforeEach(() => {
      prisma = {
        $transaction: jest.fn(async (fn) => fn(prisma)),
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: paymentId,
            hospitalId,
            branchId,
            invoiceId,
            status: PaymentStatus.SUCCEEDED,
            amount: new Prisma.Decimal(500),
            currency: 'INR',
            provider: PaymentProvider.RAZORPAY,
            providerPaymentId: 'pay_1',
          },
        ]),
        $executeRaw: jest.fn(),
        invoice: { findFirst: jest.fn().mockResolvedValue(issuedInvoice) },
        payment: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        refund: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
        paymentWebhookEvent: { create: jest.fn() },
      };
      auditService = { log: jest.fn().mockResolvedValue(undefined) };
      razorpayService = {
        createPaymentLink: jest.fn(),
        createRefund: jest.fn(),
      };
      const splitPayer = createMockInvoiceSplitPayerService();
      refundsService = new RefundsService(
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

    it('blocks second initiation when PENDING exists', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'existing',
        status: PaymentStatus.PENDING,
      });

      await expect(
        paymentsService.initiatePayment(user, invoiceId),
      ).rejects.toThrow(ConflictException);
      expect(razorpayService.createPaymentLink).not.toHaveBeenCalled();
    });

    it('blocks second initiation when SUBMIT_UNCERTAIN exists', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'existing',
        status: PaymentStatus.SUBMIT_UNCERTAIN,
      });

      await expect(
        paymentsService.initiatePayment(user, invoiceId),
      ).rejects.toThrow(ConflictException);
    });

    it('marks ambiguous payment link errors as SUBMIT_UNCERTAIN without rethrowing', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({
        id: paymentId,
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        status: PaymentStatus.INITIATED,
        providerPaymentLinkId: null,
      });
      razorpayService.createPaymentLink.mockRejectedValue(
        new RazorpayError('ambiguous', 'network'),
      );
      prisma.payment.update.mockResolvedValue({
        id: paymentId,
        status: PaymentStatus.SUBMIT_UNCERTAIN,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        providerPaymentLinkId: null,
      });

      const result = await paymentsService.initiatePayment(user, invoiceId);

      expect(result.status).toBe(PaymentStatus.SUBMIT_UNCERTAIN);
      expect(razorpayService.createPaymentLink).toHaveBeenCalledTimes(1);
    });

    it('marks permanent payment link errors as FAILED and rethrows', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.payment.create.mockResolvedValue({
        id: paymentId,
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        status: PaymentStatus.INITIATED,
      });
      razorpayService.createPaymentLink.mockRejectedValue(
        new RazorpayError('permanent', 'invalid request'),
      );
      prisma.payment.update.mockResolvedValue({});

      await expect(
        paymentsService.initiatePayment(user, invoiceId),
      ).rejects.toThrow(RazorpayError);
    });

    it('blocks new refund when reserved amount would exceed payment', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        hospitalId,
        branchId,
        invoiceId,
        status: PaymentStatus.SUCCEEDED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        providerPaymentId: 'pay_1',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        hospitalId,
        amount: new Prisma.Decimal(500),
      });
      prisma.refund.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({
          _sum: { amount: new Prisma.Decimal(450) },
        });

      await expect(
        refundsService.createRefund(
          user,
          paymentId,
          { amount: 100, reason: 'Over limit' },
          'new-key',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('returns existing refund for same idempotency key without calling Razorpay', async () => {
      prisma.refund.findUnique.mockResolvedValue({
        id: 'refund-1',
        paymentId,
        status: RefundStatus.SUBMIT_UNCERTAIN,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        providerRefundId: null,
      });

      await refundsService.createRefund(
        user,
        paymentId,
        { amount: 100, reason: 'Duplicate key' },
        'key-1',
      );

      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('createRefund stays REQUESTED and does not call Razorpay', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentId,
        hospitalId,
        branchId,
        invoiceId,
        status: PaymentStatus.SUCCEEDED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        providerPaymentId: 'pay_1',
      });
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        hospitalId,
        amount: new Prisma.Decimal(500),
      });
      prisma.refund.create.mockResolvedValue({
        id: 'refund-1',
        paymentId,
        status: RefundStatus.REQUESTED,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        providerRefundId: null,
      });

      const result = await refundsService.createRefund(
        user,
        paymentId,
        { amount: 100, reason: 'Patient dispute' },
        'key-2',
      );

      expect(result.status).toBe(RefundStatus.REQUESTED);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('marks ambiguous refund errors as SUBMIT_UNCERTAIN without rethrowing', async () => {
      const approver = { sub: 'user-2', hospitalId, branchId };
      prisma.payment.findUnique.mockResolvedValue({
        id: paymentId,
        hospitalId,
        branchId,
        invoiceId,
        status: PaymentStatus.SUCCEEDED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        providerPaymentId: 'pay_1',
      });
      let status = RefundStatus.REQUESTED;
      prisma.refund.update.mockImplementation(async (args: { data: { status?: RefundStatus } }) => {
        if (args.data.status) {
          status = args.data.status;
        }
        return {
          id: 'refund-1',
          paymentId,
          hospitalId,
          branchId,
          status,
          amount: new Prisma.Decimal(100),
          currency: 'INR',
          providerRefundId: null,
          approvedByUserId: approver.sub,
          reason: 'Test',
          requestedByUserId: user.sub,
        };
      });
      prisma.refund.findFirst.mockImplementation(async (args: { where: { id?: string } }) => {
        if (args.where.id === 'refund-1') {
          return {
            id: 'refund-1',
            hospitalId,
            branchId,
            paymentId,
            status,
            amount: new Prisma.Decimal(100),
            currency: 'INR',
            requestedByUserId: user.sub,
            reason: 'Test',
            providerPaymentId: 'pay_1',
            approvedByUserId:
              status === RefundStatus.REQUESTED ? null : approver.sub,
          };
        }
        return null;
      });
      razorpayService.createRefund.mockRejectedValue(
        new RazorpayError('ambiguous', 'timeout'),
      );

      const result = await refundsService.approveRefund(approver, 'refund-1');

      expect(result.status).toBe(RefundStatus.SUBMIT_UNCERTAIN);
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration', () => {
    const prisma = new PrismaClient();
    let dbIntegrationChain = Promise.resolve();
    const withDbIntegrationLock = <T>(fn: () => Promise<T>): Promise<T> => {
      const run = dbIntegrationChain.then(fn, fn);
      dbIntegrationChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    let dbAvailable = false;
    let hospitalId: string;
    let branchId: string;
    let patientId: string;
    let invoiceId: string;
    let paymentsService: PaymentsService;
    let refundsService: RefundsService;
    let razorpayMock: {
      createPaymentLink: jest.Mock;
      createRefund: jest.Mock;
    };
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = {
      sub: '11111111-1111-4111-8111-111111111111',
      hospitalId: '',
      branchId: '',
    };

    beforeAll(async () => {
      try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        dbAvailable = true;
      } catch {
        dbAvailable = false;
        return;
      }

      const hospital = await prisma.hospital.create({
        data: {
          name: 'Billing F0',
          code: `B-F0-${runId}`,
          branches: { create: { name: 'Main', code: 'MAIN' } },
        },
        include: { branches: true },
      });
      hospitalId = hospital.id;
      branchId = hospital.branches[0].id;
      user.hospitalId = hospitalId;
      user.branchId = branchId;

      const patient = await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'Pay',
          lastName: 'Test',
          phone: '+919811111111',
        },
      });
      patientId = patient.id;

      const invoice = await prisma.invoice.create({
        data: {
          hospitalId,
          branchId,
          patientId,
          invoiceNumber: `INV-F0-${runId}`,
          status: InvoiceStatus.ISSUED,
          currency: 'INR',
          totalAmount: new Prisma.Decimal(500),
          subtotalAmount: new Prisma.Decimal(500),
          taxAmount: new Prisma.Decimal(0),
        },
      });
      invoiceId = invoice.id;

      razorpayMock = {
        createPaymentLink: jest.fn().mockResolvedValue({
          providerPaymentLinkId: `plink_${runId}`,
          paymentLinkUrl: 'https://rzp.io/i/test',
        }),
        createRefund: jest.fn().mockResolvedValue({
          providerRefundId: `rfnd_${runId}`,
        }),
      };

      const auditMock = { log: jest.fn().mockResolvedValue(undefined) };
      const splitPayer = createMockInvoiceSplitPayerService();
      refundsService = new RefundsService(
        prisma as never,
        auditMock as never,
        razorpayMock as unknown as RazorpayService,
        splitPayer,
      );
      paymentsService = new PaymentsService(
        prisma as never,
        auditMock as never,
        razorpayMock as unknown as RazorpayService,
        refundsService,
        splitPayer,
      );
    });

    afterAll(async () => {
      if (!dbAvailable) {
        return;
      }
      await prisma.paymentWebhookEvent.deleteMany({});
      await prisma.refund.deleteMany({ where: { hospitalId } });
      await prisma.payment.deleteMany({ where: { hospitalId } });
      await prisma.invoice.deleteMany({ where: { hospitalId } });
      await prisma.patient.deleteMany({ where: { hospitalId } });
      await prisma.branch.deleteMany({ where: { hospitalId } });
      await prisma.hospital.delete({ where: { id: hospitalId } });
      await prisma.$disconnect();
    });

    const itWithDb = (name: string, fn: () => Promise<void>) => {
      it(name, async () => {
        if (!dbAvailable) {
          return;
        }
        await withDbIntegrationLock(fn);
      });
    };

    itWithDb('prevents concurrent initiation from creating two in-flight payments', async () => {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      razorpayMock.createPaymentLink.mockClear();

      let releaseFirst!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      razorpayMock.createPaymentLink.mockImplementationOnce(async () => {
        await gate;
        return {
          providerPaymentLinkId: `plink_concurrent_${runId}`,
          paymentLinkUrl: 'https://rzp.io/i/concurrent',
        };
      });

      const first = paymentsService.initiatePayment(user, invoiceId);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const inFlight = await prisma.payment.count({
          where: {
            invoiceId,
            status: {
              in: [
                PaymentStatus.INITIATED,
                PaymentStatus.PENDING,
                PaymentStatus.SUBMIT_UNCERTAIN,
              ],
            },
          },
        });
        if (inFlight >= 1) {
          break;
        }
        await new Promise((resolve) => setImmediate(resolve));
      }

      await expect(
        paymentsService.initiatePayment(user, invoiceId),
      ).rejects.toThrow(ConflictException);

      releaseFirst();
      await first;

      const count = await prisma.payment.count({
        where: {
          invoiceId,
          status: {
            in: [
              PaymentStatus.INITIATED,
              PaymentStatus.PENDING,
              PaymentStatus.SUBMIT_UNCERTAIN,
            ],
          },
        },
      });
      expect(count).toBe(1);
      expect(razorpayMock.createPaymentLink).toHaveBeenCalledTimes(1);
    });

    itWithDb('resolves SUBMIT_UNCERTAIN payment via success webhook', async () => {
      const payment = await prisma.payment.create({
        data: {
          hospitalId,
          branchId,
          invoiceId,
          amount: new Prisma.Decimal(500),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.SUBMIT_UNCERTAIN,
          providerPaymentLinkId: null,
        },
      });

      process.env.RAZORPAY_WEBHOOK_SECRET = 'test_secret_f0';
      const payload = {
        id: `evt_${runId}_uncertain`,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${runId}`,
              amount: 50000,
              currency: 'INR',
              order_id: 'order_1',
            },
          },
          payment_link: {
            entity: {
              id: `plink_webhook_${runId}`,
              reference_id: payment.id,
              amount: 50000,
              currency: 'INR',
            },
          },
        },
      };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const signature = require('crypto')
        .createHmac('sha256', 'test_secret_f0')
        .update(rawBody)
        .digest('hex');

      await paymentsService.handleRazorpayWebhook(rawBody, signature);

      const updated = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
      expect(updated.providerPaymentLinkId).toBe(`plink_webhook_${runId}`);
      expect(updated.providerPaymentId).toBe(`pay_${runId}`);
    });
  });
});
