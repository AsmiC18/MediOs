import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentPayerType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { RefundsService } from './refunds.service';
import { RazorpayService } from './razorpay.service';

describe('Refund approval workflow', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const requester = { sub: 'user-requester', hospitalId, branchId };
  const approver = { sub: 'user-approver', hospitalId, branchId };
  const paymentId = 'payment-1';
  const invoiceId = 'invoice-1';

  const succeededPayment = {
    id: paymentId,
    hospitalId,
    branchId,
    invoiceId,
    status: PaymentStatus.SUCCEEDED,
    amount: new Prisma.Decimal(5000),
    currency: 'INR',
    provider: PaymentProvider.RAZORPAY,
    providerPaymentId: 'pay_rzp',
    payerType: PaymentPayerType.PATIENT,
  };

  let prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    payment: { findFirst: jest.Mock; findUnique: jest.Mock };
    refund: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
  };
  let razorpayService: { createRefund: jest.Mock };
  let auditService: { log: jest.Mock };
  let refundsService: RefundsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([succeededPayment]),
      payment: {
        findFirst: jest.fn().mockResolvedValue(succeededPayment),
        findUnique: jest.fn().mockResolvedValue(succeededPayment),
      },
      refund: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };
    razorpayService = { createRefund: jest.fn() };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    refundsService = new RefundsService(
      prisma as never,
      auditService as never,
      razorpayService as never,
      createMockInvoiceSplitPayerService(),
    );
  });

  describe('request', () => {
    it('requires reason', async () => {
      await expect(
        refundsService.createRefund(
          requester,
          paymentId,
          { amount: 100, reason: '   ' },
          'idem-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('creates REQUESTED without Razorpay', async () => {
      prisma.refund.create.mockResolvedValue({
        id: 'ref-1',
        paymentId,
        status: RefundStatus.REQUESTED,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        providerRefundId: null,
        branchId,
      });

      const result = await refundsService.createRefund(
        requester,
        paymentId,
        { amount: 100, reason: 'Duplicate charge' },
        'idem-1',
      );

      expect(result.status).toBe(RefundStatus.REQUESTED);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_REQUESTED' }),
      );
    });

    it('rejects wrong hospital payment', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(
        refundsService.createRefund(
          requester,
          paymentId,
          { amount: 100, reason: 'x' },
          'idem-2',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('approval', () => {
    const requestedRefund = {
      id: 'ref-1',
      hospitalId,
      branchId,
      paymentId,
      status: RefundStatus.REQUESTED,
      amount: new Prisma.Decimal(2000),
      currency: 'INR',
      requestedByUserId: requester.sub,
      reason: 'Overpaid',
      providerPaymentId: 'pay_rzp',
      approvedByUserId: null,
    };

    beforeEach(() => {
      prisma.refund.findFirst.mockResolvedValue(requestedRefund);
    });

    it('blocks self-approval', async () => {
      await expect(
        refundsService.approveRefund(requester, 'ref-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('approves and executes Razorpay', async () => {
      let status = RefundStatus.REQUESTED;
      prisma.refund.update.mockImplementation(async (args: { data: { status?: RefundStatus } }) => {
        if (args.data.status) {
          status = args.data.status;
        }
        return {
          ...requestedRefund,
          status,
          approvedByUserId: approver.sub,
        };
      });
      razorpayService.createRefund.mockResolvedValue({
        providerRefundId: 'rfnd_1',
      });
      prisma.refund.findFirst.mockImplementation(async () => ({
        ...requestedRefund,
        status,
        approvedByUserId:
          status === RefundStatus.REQUESTED ? null : approver.sub,
      }));

      const result = await refundsService.approveRefund(approver, 'ref-1');

      expect(result.status).toBe(RefundStatus.PROCESSING);
      expect(razorpayService.createRefund).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_APPROVED' }),
      );
    });

    it('rejects non-requested refund', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        ...requestedRefund,
        status: RefundStatus.REJECTED,
      });
      await expect(
        refundsService.approveRefund(approver, 'ref-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejection', () => {
    it('persists rejection without Razorpay', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'ref-1',
        hospitalId,
        branchId,
        paymentId,
        status: RefundStatus.REQUESTED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
      });
      prisma.refund.update.mockResolvedValue({
        id: 'ref-1',
        paymentId,
        status: RefundStatus.REJECTED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        providerRefundId: null,
      });

      const result = await refundsService.rejectRefund(approver, 'ref-1', {
        rejectionReason: 'Not eligible',
      });

      expect(result.status).toBe(RefundStatus.REJECTED);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND_REJECTED' }),
      );
    });
  });

  describe('execution gate', () => {
    it('REQUESTED cannot execute', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: 'ref-1',
        hospitalId,
        branchId,
        paymentId,
        status: RefundStatus.REQUESTED,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
      });
      await expect(
        refundsService.executeApprovedRefund(approver, 'ref-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('split-payer (db)', () => {
    const prismaDb = new PrismaClient();
    let dbAvailable = false;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let dbHospitalId: string;
    let patientPaymentId: string;
    let insurerPaymentId: string;
    let dbInvoiceId: string;
    let splitPayer: InvoiceSplitPayerService;

    beforeAll(async () => {
      try {
        await prismaDb.$connect();
        await prismaDb.$queryRaw`SELECT 1`;
        dbAvailable = true;
      } catch {
        return;
      }

      const audit = new AuditService(prismaDb as never);
      splitPayer = new InvoiceSplitPayerService(prismaDb as never, audit);

      const hospital = await prismaDb.hospital.create({
        data: { name: `RA ${runId}`, code: `RA-${runId}` },
      });
      dbHospitalId = hospital.id;

      const patient = await prismaDb.patient.create({
        data: {
          hospitalId: dbHospitalId,
          firstName: 'Ref',
          lastName: 'Approval',
          phone: `+9199${runId.slice(-8)}`,
        },
      });

      const invoice = await prismaDb.invoice.create({
        data: {
          hospitalId: dbHospitalId,
          patientId: patient.id,
          invoiceNumber: `INV-RA-${runId}`,
          status: 'ISSUED',
          currency: 'INR',
          totalAmount: new Prisma.Decimal(10000),
          subtotalAmount: new Prisma.Decimal(10000),
          taxAmount: new Prisma.Decimal(0),
        },
      });
      dbInvoiceId = invoice.id;

      patientPaymentId = (
        await prismaDb.payment.create({
          data: {
            hospitalId: dbHospitalId,
            invoiceId: dbInvoiceId,
            amount: new Prisma.Decimal(5000),
            currency: 'INR',
            provider: PaymentProvider.RAZORPAY,
            status: PaymentStatus.SUCCEEDED,
            providerPaymentId: `pay_pt_${runId}`,
            payerType: PaymentPayerType.PATIENT,
          },
        })
      ).id;

      insurerPaymentId = (
        await prismaDb.payment.create({
          data: {
            hospitalId: dbHospitalId,
            invoiceId: dbInvoiceId,
            amount: new Prisma.Decimal(5000),
            currency: 'INR',
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.SUCCEEDED,
            payerType: PaymentPayerType.INSURER,
          },
        })
      ).id;

      await prismaDb.refund.create({
        data: {
          hospitalId: dbHospitalId,
          paymentId: patientPaymentId,
          amount: new Prisma.Decimal(2000),
          currency: 'INR',
          status: RefundStatus.SUCCEEDED,
          provider: PaymentProvider.RAZORPAY,
          reason: 'Patient partial',
        },
      });
    });

    afterAll(async () => {
      if (!dbAvailable) {
        return;
      }
      await prismaDb.refund.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prismaDb.payment.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prismaDb.invoice.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prismaDb.patient.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prismaDb.hospital.delete({ where: { id: dbHospitalId } });
      await prismaDb.$disconnect();
    });

    const itDb = (name: string, fn: () => Promise<void>) => {
      it(name, async () => {
        if (!dbAvailable) {
          return;
        }
        await fn();
      });
    };

    itDb('patient refund reduces patient net only', async () => {
      const nets = await splitPayer.sumNetPaidByPayer(
        prismaDb,
        dbInvoiceId,
        dbHospitalId,
      );
      expect(nets.patient.toFixed(2)).toBe('3000.00');
      expect(nets.insurer.toFixed(2)).toBe('5000.00');
    });
  });
});
