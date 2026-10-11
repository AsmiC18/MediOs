import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { RefundsService } from './refunds.service';

describe('PaymentsService and RefundsService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const invoiceIdA = 'invoice-a';
  const invoiceIdB = 'invoice-b';
  const paymentIdA = 'payment-a';
  const paymentIdB = 'payment-b';
  const refundIdB = 'refund-b';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

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
      };
    refund: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
  };
  let auditService: { log: jest.Mock };
  let razorpayService: {
    createPaymentLink: jest.Mock;
    createRefund: jest.Mock;
  };
  let paymentsService: PaymentsService;
  let refundsService: RefundsService;

  const issuedInvoiceA = {
    id: invoiceIdA,
    hospitalId,
    branchId: branchA,
    invoiceNumber: 'INV-000001',
    status: InvoiceStatus.ISSUED,
    currency: 'INR',
    totalAmount: new Prisma.Decimal(500),
  };

  beforeEach(() => {
      prisma = {
        $transaction: jest.fn(async (fn) => fn(prisma)),
        $queryRaw: jest.fn(),
        $executeRaw: jest.fn(),
        invoice: { findFirst: jest.fn() },
        payment: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      refund: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    razorpayService = {
      createPaymentLink: jest.fn(),
      createRefund: jest.fn(),
    };
    const splitPayer = createMockInvoiceSplitPayerService();
    refundsService = new RefundsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      razorpayService as unknown as RazorpayService,
      splitPayer,
    );
    paymentsService = new PaymentsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      razorpayService as unknown as RazorpayService,
      refundsService,
      splitPayer,
    );
  });

  describe('initiatePayment', () => {
    it('allows branch user to initiate payment for own-branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(issuedInvoiceA);
      prisma.payment.findFirst.mockResolvedValueOnce(null);
      prisma.payment.create.mockResolvedValue({
        id: paymentIdA,
        hospitalId,
        branchId: branchA,
        invoiceId: invoiceIdA,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.INITIATED,
      });
      razorpayService.createPaymentLink.mockResolvedValue({
        providerPaymentLinkId: 'plink_1',
        paymentLinkUrl: 'https://example.com/pay',
      });
      prisma.payment.update.mockResolvedValue({
        id: paymentIdA,
        status: PaymentStatus.PENDING,
        branchId: branchA,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        providerPaymentLinkId: 'plink_1',
      });

      const result = await paymentsService.initiatePayment(
        branchUser,
        invoiceIdA,
      );

      expect(result.paymentId).toBe(paymentIdA);
      expect(prisma.payment.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies branch user initiating payment for another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...issuedInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
      });

      await expect(
        paymentsService.initiatePayment(branchUser, invoiceIdB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPayment and listPaymentsForInvoice', () => {
    it('allows branch user to get own-branch payment', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentIdA,
        hospitalId,
        branchId: branchA,
        invoiceId: invoiceIdA,
        status: PaymentStatus.SUCCEEDED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
      });

      const payment = await paymentsService.getPayment(branchUser, paymentIdA);

      expect(payment.branchId).toBe(branchA);
    });

    it('denies branch user getting another branch payment', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: paymentIdB,
        hospitalId,
        branchId: branchB,
        invoiceId: invoiceIdB,
        status: PaymentStatus.SUCCEEDED,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
      });

      await expect(
        paymentsService.getPayment(branchUser, paymentIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user listing payments for another branch invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...issuedInvoiceA,
        id: invoiceIdB,
        branchId: branchB,
      });

      await expect(
        paymentsService.listPaymentsForInvoice(branchUser, invoiceIdB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('RefundsService', () => {
    const refundablePayment = {
      id: paymentIdA,
      hospitalId,
      branchId: branchA,
      invoiceId: invoiceIdA,
      status: PaymentStatus.SUCCEEDED,
      amount: new Prisma.Decimal(500),
      currency: 'INR',
      provider: PaymentProvider.RAZORPAY,
      providerPaymentId: 'pay_123',
    };

    it('allows branch user to create refund on own-branch payment', async () => {
      prisma.refund.findUnique.mockResolvedValue(null);
      prisma.payment.findFirst.mockResolvedValue(refundablePayment);
      prisma.payment.findUnique.mockResolvedValue(refundablePayment);
      prisma.$queryRaw.mockResolvedValue([refundablePayment]);
      prisma.refund.create.mockResolvedValue({
        id: 'refund-a',
        hospitalId,
        branchId: branchA,
        paymentId: paymentIdA,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: RefundStatus.REQUESTED,
        providerPaymentId: 'pay_123',
        clientRequestId: 'idem-1',
      });

      const result = await refundsService.createRefund(
        branchUser,
        paymentIdA,
        { amount: 100, reason: 'Branch refund' },
        'idem-1',
      );

      expect(result.refundId).toBe('refund-a');
      expect(result.status).toBe(RefundStatus.REQUESTED);
      expect(razorpayService.createRefund).not.toHaveBeenCalled();
    });

    it('denies branch user creating refund on another branch payment', async () => {
      prisma.refund.findUnique.mockResolvedValue(null);
      prisma.payment.findFirst.mockResolvedValue({
        ...refundablePayment,
        id: paymentIdB,
        branchId: branchB,
        invoiceId: invoiceIdB,
      });

      await expect(
        refundsService.createRefund(
          branchUser,
          paymentIdB,
          { amount: 100, reason: 'Wrong branch' },
          'idem-2',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user reading another branch refund', async () => {
      prisma.refund.findFirst.mockResolvedValue({
        id: refundIdB,
        hospitalId,
        branchId: branchB,
        paymentId: paymentIdB,
        amount: new Prisma.Decimal(50),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: RefundStatus.SUCCEEDED,
      });

      await expect(
        refundsService.getRefund(branchUser, refundIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('keeps cross-hospital payment not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        refundsService.listRefundsForPayment(branchUser, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
