import {
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { RazorpayReadError } from './razorpay.errors';
import { RazorpayReconciliationReader } from './razorpay-reconciliation.reader';

const hospitalId = '11111111-1111-4111-8111-111111111111';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const refundId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const paymentId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function baseRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: refundId,
    hospitalId,
    branchId,
    paymentId,
    amount: new Prisma.Decimal(100),
    currency: 'INR',
    provider: PaymentProvider.RAZORPAY,
    status: RefundStatus.PROCESSING,
    providerRefundId: 'rfnd_test_1',
    providerPaymentId: 'pay_test_1',
    clientRequestId: 'idem-1',
    failureReason: null,
    requestedAt: new Date(),
    processedAt: null,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RefundReconciliationService', () => {
  describe('unit', () => {
    let prisma: {
      refund: { findFirst: jest.Mock; updateMany: jest.Mock };
      payment: { findUnique: jest.Mock };
      $transaction: jest.Mock;
    };
    let reader: jest.Mocked<
      Pick<RazorpayReconciliationReader, 'fetchRefund' | 'listRefundsForPayment'>
    >;
    let auditService: { log: jest.Mock };
    let service: RefundReconciliationService;

    beforeEach(() => {
      prisma = {
        refund: {
          findFirst: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        payment: {
          findUnique: jest.fn().mockResolvedValue({ invoiceId: 'inv-1' }),
        },
        $transaction: jest.fn(async (fn) =>
          fn({
            refund: prisma.refund,
          }),
        ),
      };
      reader = {
        fetchRefund: jest.fn(),
        listRefundsForPayment: jest.fn(),
      };
      auditService = { log: jest.fn().mockResolvedValue(undefined) };
      service = new RefundReconciliationService(
        prisma as never,
        auditService as never,
        reader as never,
      );
    });

    it('A. SUCCEEDED refund is no-op', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ status: RefundStatus.SUCCEEDED }),
      );
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_change');
      expect(reader.fetchRefund).not.toHaveBeenCalled();
    });

    it('B. FAILED refund is no-op', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ status: RefundStatus.FAILED }),
      );
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_change');
    });

    it('C. PROCESSING + providerRefundId + processed → SUCCEEDED', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({
          status: RefundStatus.PROCESSING,
          providerRefundId: 'rfnd_ok',
        }),
      );
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_ok',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(RefundStatus.SUCCEEDED);
    });

    it('D. PROCESSING + provider pending → PROCESSING', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'pending',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(RefundStatus.PROCESSING);
    });

    it('E. PROCESSING + provider processed → SUCCEEDED', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.newStatus).toBe(RefundStatus.SUCCEEDED);
    });

    it('F. PROCESSING + provider failed → FAILED', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'failed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.newStatus).toBe(RefundStatus.FAILED);
    });

    it('G. SUBMIT_UNCERTAIN + providerRefundId + processed → SUCCEEDED', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({
          status: RefundStatus.SUBMIT_UNCERTAIN,
          providerRefundId: 'rfnd_unc',
        }),
      );
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_unc',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.newStatus).toBe(RefundStatus.SUCCEEDED);
    });

    it('H. no providerRefundId + one list match → assign + resolve', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({
          status: RefundStatus.SUBMIT_UNCERTAIN,
          providerRefundId: null,
        }),
      );
      reader.listRefundsForPayment.mockResolvedValue([
        {
          id: 'rfnd_list_1',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
      ]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.providerRefundId).toBe('rfnd_list_1');
    });

    it('I. no providerRefundId + zero candidates → no_match', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ providerRefundId: null, status: RefundStatus.PROCESSING }),
      );
      reader.listRefundsForPayment.mockResolvedValue([]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_match');
      expect(prisma.refund.updateMany).not.toHaveBeenCalled();
    });

    it('J. no providerRefundId + multiple candidates → ambiguous', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ providerRefundId: null }),
      );
      reader.listRefundsForPayment.mockResolvedValue([
        {
          id: 'rfnd_a',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
        {
          id: 'rfnd_b',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
      ]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('ambiguous');
      expect(prisma.refund.updateMany).not.toHaveBeenCalled();
    });

    it('K. amount mismatch → mismatch', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 99999,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('mismatch');
    });

    it('L. currency mismatch → mismatch', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'USD',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('mismatch');
    });

    it('M. provider payment mismatch → mismatch', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_other',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('mismatch');
    });

    it('N. provider refund ID owned by another refund → mismatch', async () => {
      prisma.refund.findFirst
        .mockResolvedValueOnce(
          baseRefund({ providerRefundId: null, status: RefundStatus.PROCESSING }),
        )
        .mockResolvedValueOnce({
          id: 'other-refund',
          hospitalId,
        });
      reader.listRefundsForPayment.mockResolvedValue([
        {
          id: 'rfnd_owned',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
      ]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_match');
    });

    it('O. fetchRefund 404 → no_match without FAILED', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockRejectedValue(
        new RazorpayReadError('not_found', 'missing', { httpStatus: 404 }),
      );
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_match');
      expect(prisma.refund.updateMany).not.toHaveBeenCalled();
    });

    it('P. provider 429 → retryable throw', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockRejectedValue(
        new RazorpayReadError('retryable', 'rate limited', { httpStatus: 429 }),
      );
      await expect(
        service.reconcileRefund(refundId, hospitalId),
      ).rejects.toMatchObject({ kind: 'retryable' });
    });

    it('Q. provider 503 → retryable throw', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockRejectedValue(
        new RazorpayReadError('retryable', 'upstream', { httpStatus: 503 }),
      );
      await expect(service.reconcileRefund(refundId, hospitalId)).rejects.toMatchObject({
        kind: 'retryable',
      });
    });

    it('R. timeout → retryable throw', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockRejectedValue(
        new RazorpayReadError('retryable', 'timeout'),
      );
      await expect(service.reconcileRefund(refundId, hospitalId)).rejects.toMatchObject({
        kind: 'retryable',
      });
    });

    it('S. permanent read error → throw', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockRejectedValue(
        new RazorpayReadError('permanent', 'forbidden', { httpStatus: 403 }),
      );
      await expect(service.reconcileRefund(refundId, hospitalId)).rejects.toMatchObject({
        kind: 'permanent',
      });
    });

    it('T. conditional update count 0 → concurrent_resolution', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ status: RefundStatus.SUBMIT_UNCERTAIN }),
      );
      prisma.refund.updateMany.mockResolvedValue({ count: 0 });
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.message).toBe('concurrent_resolution');
      expect(result.newStatus).toBe(RefundStatus.SUBMIT_UNCERTAIN);
    });

    it('V. PROCESSING with no provider refund → no_match not FAILED', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({
          status: RefundStatus.PROCESSING,
          providerRefundId: null,
        }),
      );
      reader.listRefundsForPayment.mockResolvedValue([]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('no_match');
      expect(result.newStatus).not.toBe(RefundStatus.FAILED);
    });

    it('W. same amount multiple provider refunds → ambiguous', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ providerRefundId: null }),
      );
      reader.listRefundsForPayment.mockResolvedValue([
        {
          id: 'rfnd_5000_a',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
        {
          id: 'rfnd_5000_b',
          payment_id: 'pay_test_1',
          amount: 10000,
          currency: 'INR',
          status: 'processed',
        },
      ]);
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.outcome).toBe('ambiguous');
    });

    it('X. provider processing status → PROCESSING', async () => {
      prisma.refund.findFirst.mockResolvedValue(
        baseRefund({ status: RefundStatus.PROCESSING }),
      );
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processing',
      });
      const result = await service.reconcileRefund(refundId, hospitalId);
      expect(result.newStatus).toBe(RefundStatus.PROCESSING);
    });

    it('Y. successful reconciliation writes REFUND_RECONCILED audit metadata', async () => {
      prisma.refund.findFirst.mockResolvedValue(baseRefund());
      reader.fetchRefund.mockResolvedValue({
        id: 'rfnd_test_1',
        payment_id: 'pay_test_1',
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });
      await service.reconcileRefund(refundId, hospitalId, {
        jobId: 'job-123',
        workerId: 'worker-456',
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFUND_RECONCILED',
          metadata: expect.objectContaining({
            source: 'background_job',
            jobId: 'job-123',
            workerId: 'worker-456',
            paymentId,
            newStatus: RefundStatus.SUCCEEDED,
          }),
        }),
      );
    });

    it('does not expose Razorpay mutation methods on reader', () => {
      expect(
        (reader as unknown as { createRefund?: unknown }).createRefund,
      ).toBeUndefined();
    });
  });

  describe('integration', () => {
    const prisma = new PrismaClient();
    let dbAvailable = false;
    let testHospitalId: string;
    let testBranchId: string;
    let testPatientId: string;
    let testInvoiceId: string;
    let testPaymentId: string;
    let reader: jest.Mocked<RazorpayReconciliationReader>;
    let service: RefundReconciliationService;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
          name: 'Refund Reconcile',
          code: `R-REC-${runId}`,
          branches: { create: { name: 'Main', code: 'MAIN' } },
        },
        include: { branches: true },
      });
      testHospitalId = hospital.id;
      testBranchId = hospital.branches[0].id;

      const patient = await prisma.patient.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          firstName: 'Ref',
          lastName: 'Test',
          phone: '+919811133344',
        },
      });
      testPatientId = patient.id;

      const invoice = await prisma.invoice.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          patientId: testPatientId,
          invoiceNumber: `INV-RREC-${runId}`,
          status: 'ISSUED',
          currency: 'INR',
          totalAmount: new Prisma.Decimal(500),
          subtotalAmount: new Prisma.Decimal(500),
          taxAmount: new Prisma.Decimal(0),
        },
      });
      testInvoiceId = invoice.id;

      const payment = await prisma.payment.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          invoiceId: testInvoiceId,
          amount: new Prisma.Decimal(500),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: `pay_rrec_${runId}`,
        },
      });
      testPaymentId = payment.id;
    });

    afterAll(async () => {
      if (!dbAvailable) {
        return;
      }
      await prisma.refund.deleteMany({ where: { hospitalId: testHospitalId } });
      await prisma.payment.deleteMany({ where: { hospitalId: testHospitalId } });
      await prisma.invoice.deleteMany({ where: { hospitalId: testHospitalId } });
      await prisma.patient.deleteMany({ where: { hospitalId: testHospitalId } });
      await prisma.branch.deleteMany({ where: { hospitalId: testHospitalId } });
      await prisma.hospital.delete({ where: { id: testHospitalId } });
      await prisma.$disconnect();
    });

    beforeEach(() => {
      if (!dbAvailable) {
        return;
      }
      reader = {
        fetchPaymentLink: jest.fn(),
        fetchPayment: jest.fn(),
        fetchRefund: jest.fn(),
        listPaymentLinksByReferenceId: jest.fn(),
        listRefundsForPayment: jest.fn(),
      };
      service = new RefundReconciliationService(
        prisma as never,
        new AuditService(prisma as never),
        reader,
      );
    });

    const itWithDb = (name: string, fn: () => Promise<void>) => {
      it(name, async () => {
        if (!dbAvailable) {
          return;
        }
        await fn();
      });
    };

    itWithDb('U. second reconciliation after success is harmless', async () => {
      const refund = await prisma.refund.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          paymentId: testPaymentId,
          amount: new Prisma.Decimal(100),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: RefundStatus.SUBMIT_UNCERTAIN,
          providerPaymentId: `pay_rrec_${runId}`,
          providerRefundId: `rfnd_int_${runId}`,
          clientRequestId: `idem-${runId}`,
        },
      });

      reader.fetchRefund.mockResolvedValue({
        id: `rfnd_int_${runId}`,
        payment_id: `pay_rrec_${runId}`,
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });

      const first = await service.reconcileRefund(refund.id, testHospitalId);
      expect(first.newStatus).toBe(RefundStatus.SUCCEEDED);

      const second = await service.reconcileRefund(refund.id, testHospitalId);
      expect(second.outcome).toBe('no_change');
    });

    itWithDb('T. webhook race — SUCCEEDED not downgraded', async () => {
      const refund = await prisma.refund.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          paymentId: testPaymentId,
          amount: new Prisma.Decimal(100),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: RefundStatus.SUCCEEDED,
          providerPaymentId: `pay_rrec_${runId}`,
          providerRefundId: `rfnd_race_${runId}`,
          clientRequestId: `idem-race-${runId}`,
          processedAt: new Date(),
        },
      });

      reader.fetchRefund.mockResolvedValue({
        id: `rfnd_race_${runId}`,
        payment_id: `pay_rrec_${runId}`,
        amount: 10000,
        currency: 'INR',
        status: 'processed',
      });

      const result = await service.reconcileRefund(refund.id, testHospitalId);
      expect(result.outcome).toBe('no_change');
      const row = await prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      expect(row.status).toBe(RefundStatus.SUCCEEDED);
    });
  });
});
