import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { RazorpayReadError } from './razorpay.errors';
import { RazorpayReconciliationReader } from './razorpay-reconciliation.reader';

const hospitalId = '11111111-1111-4111-8111-111111111111';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const paymentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const invoiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function basePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentId,
    hospitalId,
    branchId,
    invoiceId,
    amount: new Prisma.Decimal(500),
    currency: 'INR',
    provider: PaymentProvider.RAZORPAY,
    status: PaymentStatus.PENDING,
    providerPaymentLinkId: 'plink_test_1',
    providerPaymentId: null,
    providerOrderId: null,
    failureReason: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function baseInvoice() {
  return {
    id: invoiceId,
    hospitalId,
    branchId,
    status: InvoiceStatus.ISSUED,
    currency: 'INR',
  };
}

describe('PaymentReconciliationService', () => {
  describe('unit', () => {
    let prisma: {
      payment: {
        findFirst: jest.Mock;
        updateMany: jest.Mock;
      };
      invoice: {
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      $transaction: jest.Mock;
    };
    let reader: jest.Mocked<
      Pick<
        RazorpayReconciliationReader,
        'fetchPaymentLink' | 'fetchPayment' | 'listPaymentLinksByReferenceId'
      >
    >;
    let auditService: { log: jest.Mock };
    let service: PaymentReconciliationService;

    beforeEach(() => {
      prisma = {
        payment: {
          findFirst: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoice: {
          findUnique: jest.fn().mockResolvedValue(baseInvoice()),
          update: jest.fn(),
        },
        $transaction: jest.fn(async (fn) =>
          fn({
            payment: prisma.payment,
            invoice: prisma.invoice,
          }),
        ),
      };
      reader = {
        fetchPaymentLink: jest.fn(),
        fetchPayment: jest.fn(),
        listPaymentLinksByReferenceId: jest.fn(),
      };
      auditService = { log: jest.fn().mockResolvedValue(undefined) };
      service = new PaymentReconciliationService(
        prisma as never,
        auditService as never,
        reader as never,
        createMockInvoiceSplitPayerService({ syncMarksPaid: true }),
      );
    });

    it('A. SUCCEEDED payment is no-op', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ status: PaymentStatus.SUCCEEDED }),
      );
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('no_change');
      expect(reader.fetchPaymentLink).not.toHaveBeenCalled();
    });

    it('B. FAILED payment is no-op', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ status: PaymentStatus.FAILED }),
      );
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('no_change');
    });

    it('C. INITIATED + link ID + unpaid link → PENDING', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.INITIATED,
          providerPaymentLinkId: 'plink_unpaid',
        }),
      );
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_unpaid',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'created',
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(PaymentStatus.PENDING);
      expect(prisma.payment.updateMany).toHaveBeenCalled();
    });

    it('D. INITIATED + paid provider payment → SUCCEEDED', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.INITIATED,
          providerPaymentLinkId: 'plink_paid',
        }),
      );
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_paid',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
        payments: { payment_id: 'pay_ok', status: 'captured' },
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_ok',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(PaymentStatus.SUCCEEDED);
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: InvoiceStatus.PAID }),
        }),
      );
    });

    it('E. PENDING + unpaid link → no_change', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.PENDING,
          providerPaymentLinkId: 'plink_same',
        }),
      );
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_same',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'created',
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('no_change');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('F. PENDING + captured provider payment → SUCCEEDED', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.PENDING,
          providerPaymentId: 'pay_cap',
        }),
      );
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_cap',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(PaymentStatus.SUCCEEDED);
    });

    it('G. SUBMIT_UNCERTAIN + success evidence → SUCCEEDED', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.SUBMIT_UNCERTAIN,
          providerPaymentLinkId: null,
        }),
      );
      reader.listPaymentLinksByReferenceId.mockResolvedValue([
        {
          id: 'plink_unc',
          reference_id: paymentId,
          amount: 50000,
          currency: 'INR',
          status: 'paid',
          payments: { payment_id: 'pay_unc', status: 'captured' },
        },
      ]);
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_unc',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(PaymentStatus.SUCCEEDED);
    });

    it('H. no link ID + one list match → backfill and resolve', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({
          status: PaymentStatus.SUBMIT_UNCERTAIN,
          providerPaymentLinkId: null,
        }),
      );
      reader.listPaymentLinksByReferenceId.mockResolvedValue([
        {
          id: 'plink_single',
          reference_id: paymentId,
          amount: 50000,
          currency: 'INR',
          status: 'created',
        },
      ]);
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.newStatus).toBe(PaymentStatus.PENDING);
    });

    it('I. no link ID + zero matches → no_match', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ providerPaymentLinkId: null }),
      );
      reader.listPaymentLinksByReferenceId.mockResolvedValue([]);
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('no_match');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('J. no link ID + multiple matches → ambiguous', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ providerPaymentLinkId: null }),
      );
      reader.listPaymentLinksByReferenceId.mockResolvedValue([
        {
          id: 'plink_a',
          reference_id: paymentId,
          amount: 50000,
          currency: 'INR',
        },
        {
          id: 'plink_b',
          reference_id: paymentId,
          amount: 50000,
          currency: 'INR',
        },
      ]);
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('ambiguous');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('K. amount mismatch → mismatch', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: paymentId,
        amount: 99999,
        currency: 'INR',
        status: 'created',
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('mismatch');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('L. currency mismatch → mismatch', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: paymentId,
        amount: 50000,
        currency: 'USD',
        status: 'created',
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('mismatch');
    });

    it('M. reference mismatch → mismatch', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: 'other-payment-id',
        amount: 50000,
        currency: 'INR',
        status: 'created',
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('mismatch');
    });

    it('N. provider link 404 + empty list → not_found without destructive update', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ status: PaymentStatus.SUBMIT_UNCERTAIN }),
      );
      reader.fetchPaymentLink.mockRejectedValue(
        new RazorpayReadError('not_found', 'missing', { httpStatus: 404 }),
      );
      reader.listPaymentLinksByReferenceId.mockResolvedValue([]);
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('no_match');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('O. provider 429 → retryable throw', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockRejectedValue(
        new RazorpayReadError('retryable', 'rate limited', { httpStatus: 429 }),
      );
      await expect(
        service.reconcilePayment(paymentId, hospitalId),
      ).rejects.toMatchObject({ kind: 'retryable' });
    });

    it('P. provider 503 → retryable throw', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockRejectedValue(
        new RazorpayReadError('retryable', 'upstream', { httpStatus: 503 }),
      );
      await expect(
        service.reconcilePayment(paymentId, hospitalId),
      ).rejects.toMatchObject({ kind: 'retryable' });
    });

    it('Q. timeout → retryable throw', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockRejectedValue(
        new RazorpayReadError('retryable', 'timeout'),
      );
      await expect(
        service.reconcilePayment(paymentId, hospitalId),
      ).rejects.toMatchObject({ kind: 'retryable' });
    });

    it('R. permanent read error → throw', async () => {
      prisma.payment.findFirst.mockResolvedValue(basePayment());
      reader.fetchPaymentLink.mockRejectedValue(
        new RazorpayReadError('permanent', 'forbidden', { httpStatus: 403 }),
      );
      await expect(
        service.reconcilePayment(paymentId, hospitalId),
      ).rejects.toMatchObject({ kind: 'permanent' });
    });

    it('S. conditional update count 0 → concurrent no-op', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        basePayment({ providerPaymentId: 'pay_race' }),
      );
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_race',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('resolved');
      expect(result.message).toBe('concurrent_resolution');
      expect(result.newStatus).toBe(PaymentStatus.PENDING);
    });

    it('U. provider payment ID owned by another payment → mismatch', async () => {
      prisma.payment.findFirst
        .mockResolvedValueOnce(basePayment({ providerPaymentId: 'pay_dup' }))
        .mockResolvedValueOnce({
          id: 'other-payment',
          hospitalId,
        });
      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_test_1',
        reference_id: paymentId,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_dup',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });
      const result = await service.reconcilePayment(paymentId, hospitalId);
      expect(result.outcome).toBe('mismatch');
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('does not expose Razorpay mutations on reader mock', () => {
      expect(
        (reader as unknown as { createPaymentLink?: unknown }).createPaymentLink,
      ).toBeUndefined();
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
    let service: PaymentReconciliationService;
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
          name: 'Pay Reconcile',
          code: `P-REC-${runId}`,
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
          firstName: 'Rec',
          lastName: 'Test',
          phone: '+919811122233',
        },
      });
      testPatientId = patient.id;

      const invoice = await prisma.invoice.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          patientId: testPatientId,
          invoiceNumber: `INV-REC-${runId}`,
          status: InvoiceStatus.ISSUED,
          currency: 'INR',
          totalAmount: new Prisma.Decimal(500),
          subtotalAmount: new Prisma.Decimal(500),
          taxAmount: new Prisma.Decimal(0),
        },
      });
      testInvoiceId = invoice.id;
    });

    afterAll(async () => {
      if (!dbAvailable) {
        return;
      }
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
      service = new PaymentReconciliationService(
        prisma as never,
        new AuditService(prisma as never),
        reader,
        createMockInvoiceSplitPayerService({ syncMarksPaid: true }),
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

    itWithDb('T. second reconciliation after success is harmless', async () => {
      const payment = await prisma.payment.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          invoiceId: testInvoiceId,
          amount: new Prisma.Decimal(500),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.PENDING,
          providerPaymentLinkId: 'plink_int_t',
          providerPaymentId: 'pay_int_t',
        },
      });
      testPaymentId = payment.id;

      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_int_t',
        reference_id: payment.id,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_int_t',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });

      const first = await service.reconcilePayment(payment.id, testHospitalId);
      expect(first.newStatus).toBe(PaymentStatus.SUCCEEDED);

      const second = await service.reconcilePayment(payment.id, testHospitalId);
      expect(second.outcome).toBe('no_change');

      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: testInvoiceId },
      });
      expect(invoice.status).toBe(InvoiceStatus.PAID);
    });

    itWithDb('V. success reconciliation marks invoice PAID like webhook', async () => {
      const inv = await prisma.invoice.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          patientId: testPatientId,
          invoiceNumber: `INV-REC2-${runId}`,
          status: InvoiceStatus.ISSUED,
          currency: 'INR',
          totalAmount: new Prisma.Decimal(500),
          subtotalAmount: new Prisma.Decimal(500),
          taxAmount: new Prisma.Decimal(0),
        },
      });
      const payment = await prisma.payment.create({
        data: {
          hospitalId: testHospitalId,
          branchId: testBranchId,
          invoiceId: inv.id,
          amount: new Prisma.Decimal(500),
          currency: 'INR',
          provider: PaymentProvider.RAZORPAY,
          status: PaymentStatus.SUBMIT_UNCERTAIN,
          providerPaymentLinkId: 'plink_inv_paid',
          providerPaymentId: 'pay_inv_paid',
        },
      });

      reader.fetchPaymentLink.mockResolvedValue({
        id: 'plink_inv_paid',
        reference_id: payment.id,
        amount: 50000,
        currency: 'INR',
        status: 'paid',
      });
      reader.fetchPayment.mockResolvedValue({
        id: 'pay_inv_paid',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        captured: true,
      });

      await service.reconcilePayment(payment.id, testHospitalId, {
        jobId: 'job-test',
        workerId: 'worker-test',
      });

      const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: inv.id },
      });
      expect(updatedInvoice.status).toBe(InvoiceStatus.PAID);
      expect(updatedInvoice.paidAt).not.toBeNull();
    });
  });
});
