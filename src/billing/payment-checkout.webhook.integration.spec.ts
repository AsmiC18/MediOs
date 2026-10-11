import {
  InvoiceStatus,
  PaymentCheckoutIntentStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { createMockInvoiceSplitPayerService } from './invoice-split-payer.test-util';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { RazorpayService } from './razorpay.service';

describe('Payment checkout webhook reconciliation (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let hospitalId: string;
  let branchId: string;
  let userId: string;
  let patientId: string;
  let invoiceId: string;
  let paymentsService: PaymentsService;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    const audit = new AuditService(prisma as never);
    const splitPayer = createMockInvoiceSplitPayerService();
    const razorpayService = { createPaymentLink: jest.fn(), createRefund: jest.fn() };
    const refundsService = new RefundsService(
      prisma as never,
      audit,
      razorpayService as never,
      splitPayer,
    );
    paymentsService = new PaymentsService(
      prisma as never,
      audit,
      razorpayService as never,
      refundsService,
      splitPayer,
    );

    const hospital = await prisma.hospital.create({
      data: { name: `Checkout WH ${runId}`, code: `CWH-${runId}` },
    });
    hospitalId = hospital.id;
    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `B-${runId}` },
    });
    branchId = branch.id;
    const role = await prisma.role.create({
      data: {
        hospitalId,
        name: `Role-${runId}`,
        description: 'checkout webhook test',
      },
    });
    userId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId,
          roleId: role.id,
          email: `checkout-${runId}@test.com`,
          name: 'Checkout Tester',
          passwordHash: 'hash',
        },
      })
    ).id;
    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId,
          firstName: 'Pat',
          phone: `9${runId.slice(-9)}2`,
        },
      })
    ).id;
    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        invoiceNumber: `INV-CWH-${runId}`,
        status: InvoiceStatus.ISSUED,
        subtotalAmount: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(500),
        issuedAt: new Date(),
      },
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  const itDb = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });

  itDb('reconciles checkout intent to PAID on success webhook', async () => {
    const intent = await prisma.paymentCheckoutIntent.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        status: PaymentCheckoutIntentStatus.PENDING,
        idempotencyKey: `idem-${runId}`,
        createdByUserId: userId,
        providerOrderId: `order_${runId}`,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.PENDING,
        providerOrderId: `order_${runId}`,
      },
    });

    await prisma.paymentCheckoutIntent.update({
      where: { id: intent.id },
      data: { paymentId: payment.id },
    });

    process.env.RAZORPAY_WEBHOOK_SECRET = 'checkout_wh_secret';
    const payload = {
      id: `evt_${runId}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${runId}`,
            amount: 50000,
            currency: 'INR',
            order_id: `order_${runId}`,
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = require('crypto')
      .createHmac('sha256', 'checkout_wh_secret')
      .update(rawBody)
      .digest('hex');

    const result = await paymentsService.handleRazorpayWebhook(rawBody, signature);
    expect(result.processed).toBe(true);

    const updatedIntent = await prisma.paymentCheckoutIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(updatedIntent.status).toBe(PaymentCheckoutIntentStatus.PAID);

    const updatedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(updatedPayment.status).toBe(PaymentStatus.SUCCEEDED);
  });

  itDb('duplicate webhook does not change PAID checkout intent', async () => {
    const orderId = `order_dup_${runId}`;
    const intent = await prisma.paymentCheckoutIntent.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        status: PaymentCheckoutIntentStatus.PAID,
        idempotencyKey: `idem-dup-${runId}`,
        createdByUserId: userId,
        providerOrderId: orderId,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(500),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.SUCCEEDED,
        providerOrderId: orderId,
      },
    });
    await prisma.paymentCheckoutIntent.update({
      where: { id: intent.id },
      data: { paymentId: payment.id },
    });

    const payload = {
      id: `evt_dup_${runId}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_dup_${runId}`,
            amount: 50000,
            currency: 'INR',
            order_id: orderId,
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = require('crypto')
      .createHmac('sha256', 'checkout_wh_secret')
      .update(rawBody)
      .digest('hex');

    const first = await paymentsService.handleRazorpayWebhook(rawBody, signature);
    expect(first.processed).toBe(true);
    expect(first.duplicate).toBe(false);

    const replay = await paymentsService.handleRazorpayWebhook(rawBody, signature);
    expect(replay.duplicate).toBe(true);

    const unchanged = await prisma.paymentCheckoutIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(unchanged.status).toBe(PaymentCheckoutIntentStatus.PAID);
  });
});
