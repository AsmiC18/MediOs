jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: jest.fn() },
  SchedulerRegistry: jest.fn(),
}));

import {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RefundStatus,
} from '@prisma/client';
import {
  billingPaymentReconcileIdempotencyKey,
  billingRefundReconcileIdempotencyKey,
} from '../../billing/reconciliation-job.types';
import { JobService } from '../job.service';
import { JOB_TYPES } from '../job-types.constants';
import { BillingPaymentReconcileSchedulerTask } from './billing-payment-reconcile-scheduler.task';
import { BillingRefundReconcileSchedulerTask } from './billing-refund-reconcile-scheduler.task';

function scopeHospitals(
  transaction: Prisma.TransactionClient,
  hospitalIds: string[],
): Prisma.TransactionClient {
  return {
    ...transaction,
    hospital: {
      ...transaction.hospital,
      findMany: (args?: Prisma.HospitalFindManyArgs) =>
        transaction.hospital.findMany({
          ...args,
          where: {
            AND: [{ id: { in: hospitalIds } }, args?.where ?? {}],
          },
        }),
    },
  } as Prisma.TransactionClient;
}

describe('Billing reconciliation scheduler tasks (unit)', () => {
  it('Q. enqueues jobs for INITIATED, PENDING, SUBMIT_UNCERTAIN payments only', async () => {
    const paymentTask = new BillingPaymentReconcileSchedulerTask();
    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'j1' });
    const payments = [
      { id: 'p-init', hospitalId: 'h1', status: PaymentStatus.INITIATED },
      { id: 'p-pend', hospitalId: 'h1', status: PaymentStatus.PENDING },
      {
        id: 'p-unc',
        hospitalId: 'h1',
        status: PaymentStatus.SUBMIT_UNCERTAIN,
      },
    ];
    const transaction = {
      payment: {
        findMany: jest.fn().mockResolvedValue(
          payments.map((p) => ({ id: p.id, hospitalId: p.hospitalId })),
        ),
      },
      job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    await paymentTask.run({
      windowKey: 'w',
      tickAt: new Date(),
      hospitalId: 'h1',
      transaction: transaction as never,
      jobService: { enqueueWithClient } as never,
    });

    expect(transaction.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [
              PaymentStatus.INITIATED,
              PaymentStatus.PENDING,
              PaymentStatus.SUBMIT_UNCERTAIN,
            ],
          },
        }),
      }),
    );
    expect(transaction.job.findMany).toHaveBeenCalledTimes(1);
    expect(enqueueWithClient).toHaveBeenCalledTimes(3);
    expect(enqueueWithClient.mock.calls[0][1]).toMatchObject({
      hospitalId: 'h1',
      branchId: null,
      type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
      idempotencyKey: billingPaymentReconcileIdempotencyKey('p-init', 1),
      payload: { paymentId: 'p-init' },
    });
  });

  it('R. does not query terminal payment statuses in scheduler filter', async () => {
    const paymentTask = new BillingPaymentReconcileSchedulerTask();
    const transaction = {
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    await paymentTask.run({
      windowKey: 'w',
      tickAt: new Date(),
      hospitalId: 'h1',
      transaction: transaction as never,
      jobService: { enqueueWithClient: jest.fn() } as never,
    });
    const statusFilter = transaction.payment.findMany.mock.calls[0][0].where
      .status.in as PaymentStatus[];
    expect(statusFilter).not.toContain(PaymentStatus.SUCCEEDED);
    expect(statusFilter).not.toContain(PaymentStatus.FAILED);
    expect(statusFilter).not.toContain(PaymentStatus.CANCELLED);
  });

  it('S. enqueues jobs for PROCESSING and SUBMIT_UNCERTAIN refunds', async () => {
    const refundTask = new BillingRefundReconcileSchedulerTask();
    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'j1' });
    const transaction = {
      refund: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', hospitalId: 'h1' },
          { id: 'r2', hospitalId: 'h1' },
        ]),
      },
      job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    await refundTask.run({
      windowKey: 'w',
      tickAt: new Date(),
      hospitalId: 'h1',
      transaction: transaction as never,
      jobService: { enqueueWithClient } as never,
    });

    expect(transaction.refund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [RefundStatus.PROCESSING, RefundStatus.SUBMIT_UNCERTAIN],
          },
        }),
      }),
    );
    expect(transaction.job.findMany).toHaveBeenCalledTimes(1);
    expect(enqueueWithClient).toHaveBeenCalledTimes(2);
  });

  it('T. refund scheduler excludes terminal statuses from query filter', async () => {
    const refundTask = new BillingRefundReconcileSchedulerTask();
    const transaction = {
      refund: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      job: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    await refundTask.run({
      windowKey: 'w',
      tickAt: new Date(),
      hospitalId: 'h1',
      transaction: transaction as never,
      jobService: { enqueueWithClient: jest.fn() } as never,
    });
    const statusFilter = transaction.refund.findMany.mock.calls[0][0].where.status
      .in as RefundStatus[];
    expect(statusFilter).not.toContain(RefundStatus.SUCCEEDED);
    expect(statusFilter).not.toContain(RefundStatus.FAILED);
  });

  it('U/V. uses deterministic idempotency keys', async () => {
    const paymentTask = new BillingPaymentReconcileSchedulerTask();
    const refundTask = new BillingRefundReconcileSchedulerTask();
    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'j1' });
    const jobService = { enqueueWithClient } as never;
    const ctx = {
      windowKey: 'w',
      tickAt: new Date(),
      jobService,
    };

    await paymentTask.run({
      ...ctx,
      hospitalId: 'h1',
      transaction: {
        payment: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'pay-99', hospitalId: 'h1' }]),
        },
        job: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
    });
    await refundTask.run({
      ...ctx,
      hospitalId: 'h1',
      transaction: {
        refund: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'ref-88', hospitalId: 'h1' }]),
        },
        job: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
    });

    expect(enqueueWithClient.mock.calls[0][1].idempotencyKey).toBe(
      billingPaymentReconcileIdempotencyKey('pay-99', 1),
    );
    expect(enqueueWithClient.mock.calls[1][1].idempotencyKey).toBe(
      billingRefundReconcileIdempotencyKey('ref-88', 1),
    );
  });

  it('AB. scheduler tasks set branchId null on enqueued jobs', async () => {
    const paymentTask = new BillingPaymentReconcileSchedulerTask();
    const enqueueWithClient = jest.fn().mockResolvedValue({ id: 'j1' });
    await paymentTask.run({
      windowKey: 'w',
      tickAt: new Date(),
      hospitalId: 'h1',
      transaction: {
        payment: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'p1', hospitalId: 'h1' }]),
        },
        job: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      jobService: { enqueueWithClient } as never,
    });
    expect(enqueueWithClient.mock.calls[0][1].branchId).toBeNull();
  });
});

describe('Billing reconciliation scheduler tasks (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  let hospitalId: string;
  let branchId: string;
  let patientId: string;
  let invoiceId: string;
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
      data: { name: 'Bill Recon Sched', code: `BRS-${runId}` },
    });
    hospitalId = hospital.id;
    const branch = await prisma.branch.create({
      data: { hospitalId, name: 'Main', code: `BR-${runId}` },
    });
    branchId = branch.id;
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId,
        firstName: 'Sched',
        lastName: 'Patient',
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientId = patient.id;
    const invoice = await prisma.invoice.create({
      data: {
        hospitalId,
        branchId,
        patientId,
        invoiceNumber: `INV-BRS-${runId}`,
        status: InvoiceStatus.ISSUED,
        currency: 'INR',
        totalAmount: new Prisma.Decimal(100),
        subtotalAmount: new Prisma.Decimal(100),
        taxAmount: new Prisma.Decimal(0),
      },
    });
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: {
        hospitalId,
        type: {
          in: [
            JOB_TYPES.BILLING_PAYMENT_RECONCILE,
            JOB_TYPES.BILLING_REFUND_RECONCILE,
          ],
        },
      },
    });
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
      await fn();
    });
  };

  itWithDb('W. repeated payment scheduler run does not duplicate jobs', async () => {
    const payment = await prisma.payment.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.PENDING,
        providerPaymentLinkId: `plink_brs_${runId}`,
      },
    });

    const task = new BillingPaymentReconcileSchedulerTask();
    const jobService = new JobService(prisma as never);
    const run = () =>
      prisma.$transaction(async (transaction) =>
        task.run({
          windowKey: 'w',
          tickAt: new Date(),
          hospitalId,
          transaction,
          jobService,
        }),
      );

    await run();
    await run();

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 1),
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.branchId).toBeNull();
    expect(jobs[0]?.payload).toEqual({ paymentId: payment.id });

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('W-refund. repeated refund scheduler run does not duplicate jobs', async () => {
    const payment = await prisma.payment.create({
      data: {
        hospitalId,
        branchId,
        invoiceId,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.SUCCEEDED,
        providerPaymentLinkId: `plink_brs_r_${runId}`,
        providerPaymentId: `pay_brs_r_${runId}`,
      },
    });
    const refund = await prisma.refund.create({
      data: {
        hospitalId,
        branchId,
        paymentId: payment.id,
        amount: new Prisma.Decimal(50),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: RefundStatus.PROCESSING,
        providerRefundId: `rfnd_brs_${runId}`,
      },
    });

    const task = new BillingRefundReconcileSchedulerTask();
    const jobService = new JobService(prisma as never);
    const run = () =>
      prisma.$transaction(async (transaction) =>
        task.run({
          windowKey: 'w',
          tickAt: new Date(),
          hospitalId,
          transaction,
          jobService,
        }),
      );

    await run();
    await run();

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId,
        type: JOB_TYPES.BILLING_REFUND_RECONCILE,
        idempotencyKey: billingRefundReconcileIdempotencyKey(refund.id, 1),
      },
    });
    expect(jobs).toHaveLength(1);

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
    await prisma.refund.delete({ where: { id: refund.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });
});
