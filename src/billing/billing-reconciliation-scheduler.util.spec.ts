jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: jest.fn() },
  SchedulerRegistry: jest.fn(),
}));

import {
  InvoiceStatus,
  JobStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  PrismaClient,
  RefundStatus,
} from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { BillingPaymentReconcileSchedulerTask } from '../jobs/scheduler/billing-payment-reconcile-scheduler.task';
import { BillingRefundReconcileSchedulerTask } from '../jobs/scheduler/billing-refund-reconcile-scheduler.task';
import {
  cooldownMsAfterGeneration,
  decideNextReconciliationGeneration,
  loadPaymentReconcileJobHistory,
  tryEnqueuePaymentReconcileIfEligible,
  tryEnqueueRefundReconcileIfEligible,
} from './billing-reconciliation-scheduler.util';
import {
  billingPaymentReconcileIdempotencyKey,
  billingRefundReconcileIdempotencyKey,
} from './reconciliation-job.types';

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

describe('billing-reconciliation-scheduler.util (pure)', () => {
  const base = new Date('2026-10-05T12:00:00Z');

  it('U/V. generation keys are deterministic', () => {
    expect(billingPaymentReconcileIdempotencyKey('pay-1', 2)).toBe(
      `${JOB_TYPES.BILLING_PAYMENT_RECONCILE}:pay-1:2`,
    );
    expect(billingRefundReconcileIdempotencyKey('ref-1', 3)).toBe(
      `${JOB_TYPES.BILLING_REFUND_RECONCILE}:ref-1:3`,
    );
  });

  it('A/B. empty history → generation 1', () => {
    expect(decideNextReconciliationGeneration([], base)).toBe(1);
  });

  it('C/D. completed job before cooldown → no enqueue', () => {
    const completedAt = new Date(base.getTime() - 5 * 60 * 1000);
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 1,
            status: JobStatus.COMPLETED,
            completedAt,
            failedAt: null,
            updatedAt: completedAt,
          },
        ],
        base,
      ),
    ).toBeNull();
  });

  it('E/F. completed job after cooldown → generation 2', () => {
    const completedAt = new Date(
      base.getTime() - cooldownMsAfterGeneration(1) - 1000,
    );
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 1,
            status: JobStatus.COMPLETED,
            completedAt,
            failedAt: null,
            updatedAt: completedAt,
          },
        ],
        base,
      ),
    ).toBe(2);
  });

  it('G/H. DEAD job before cooldown → no enqueue', () => {
    const failedAt = new Date(base.getTime() - 60 * 1000);
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 1,
            status: JobStatus.DEAD,
            completedAt: null,
            failedAt,
            updatedAt: failedAt,
          },
        ],
        base,
      ),
    ).toBeNull();
  });

  it('I/J. DEAD job after cooldown → generation 2', () => {
    const failedAt = new Date(
      base.getTime() - cooldownMsAfterGeneration(1) - 1000,
    );
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 1,
            status: JobStatus.DEAD,
            completedAt: null,
            failedAt,
            updatedAt: failedAt,
          },
        ],
        base,
      ),
    ).toBe(2);
  });

  it('O/P. PENDING or RUNNING latest generation → no new generation', () => {
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 1,
            status: JobStatus.PENDING,
            completedAt: null,
            failedAt: null,
            updatedAt: base,
          },
        ],
        base,
      ),
    ).toBeNull();
    expect(
      decideNextReconciliationGeneration(
        [
          {
            generation: 2,
            status: JobStatus.RUNNING,
            completedAt: null,
            failedAt: null,
            updatedAt: base,
          },
        ],
        base,
      ),
    ).toBeNull();
  });

  it('escalating cooldown tiers', () => {
    expect(cooldownMsAfterGeneration(1)).toBe(15 * 60 * 1000);
    expect(cooldownMsAfterGeneration(2)).toBe(30 * 60 * 1000);
    expect(cooldownMsAfterGeneration(3)).toBe(60 * 60 * 1000);
    expect(cooldownMsAfterGeneration(4)).toBe(4 * 60 * 60 * 1000);
  });
});

describe('billing-reconciliation-scheduler.util (integration)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  let hospitalAId: string;
  let hospitalBId: string;
  let branchAId: string;
  let patientAId: string;
  let invoiceAId: string;
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

    const hospitalA = await prisma.hospital.create({
      data: { name: 'Re-enq A', code: `REQ-A-${runId}` },
    });
    const hospitalB = await prisma.hospital.create({
      data: { name: 'Re-enq B', code: `REQ-B-${runId}` },
    });
    hospitalAId = hospitalA.id;
    hospitalBId = hospitalB.id;

    const branch = await prisma.branch.create({
      data: { hospitalId: hospitalAId, name: 'Main', code: `BR-${runId}` },
    });
    branchAId = branch.id;
    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        firstName: 'Re',
        lastName: 'Enqueue',
        phone: `9${runId.slice(-9)}`,
      },
    });
    patientAId = patient.id;
    const invoice = await prisma.invoice.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        patientId: patientAId,
        invoiceNumber: `INV-REQ-${runId}`,
        status: InvoiceStatus.ISSUED,
        currency: 'INR',
        totalAmount: new Prisma.Decimal(100),
        subtotalAmount: new Prisma.Decimal(100),
        taxAmount: new Prisma.Decimal(0),
      },
    });
    invoiceAId = invoice.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
    });
    await prisma.payment.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.invoice.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.patient.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.branch.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalAId, hospitalBId] } },
    });
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

  async function createPendingPayment(linkSuffix: string) {
    return prisma.payment.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        invoiceId: invoiceAId,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.PENDING,
        providerPaymentLinkId: `plink_${linkSuffix}`,
      },
    });
  }

  itWithDb('A. first unresolved payment creates generation 1', async () => {
    const payment = await createPendingPayment(`a1_${runId}`);
    const jobService = new JobService(prisma as never);
    const tickAt = new Date();

    const enqueued = await prisma.$transaction(async (transaction) =>
      tryEnqueuePaymentReconcileIfEligible(
        {
          windowKey: 'w',
          tickAt,
          transaction,
          jobService,
        },
        hospitalAId,
        payment.id,
      ),
    );

    expect(enqueued).toBe(true);
    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 1),
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.branchId).toBeNull();

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('AA regression: COMPLETED gen1 + still PENDING + cooldown → gen2', async () => {
    const payment = await createPendingPayment(`reg_${runId}`);
    const completedAt = new Date(Date.now() - 20 * 60 * 1000);
    await prisma.job.create({
      data: {
        hospitalId: hospitalAId,
        branchId: null,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 1),
        payload: { paymentId: payment.id },
        status: JobStatus.COMPLETED,
        maxAttempts: 5,
        completedAt,
      },
    });

    const jobService = new JobService(prisma as never);
    const enqueued = await prisma.$transaction(async (transaction) =>
      tryEnqueuePaymentReconcileIfEligible(
        {
          windowKey: 'w',
          tickAt: new Date(),
          transaction,
          jobService,
        },
        hospitalAId,
        payment.id,
      ),
    );

    expect(enqueued).toBe(true);
    const gen2 = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 2),
      },
    });
    expect(gen2).toHaveLength(1);

    await prisma.job.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('no re-enqueue loop: three ticks within cooldown → one gen1 job', async () => {
    const payment = await createPendingPayment(`loop_${runId}`);
    const task = new BillingPaymentReconcileSchedulerTask();
    const jobService = new JobService(prisma as never);
    const tickAt = new Date();

    const run = () =>
      prisma.$transaction(async (transaction) =>
        task.run({
          windowKey: 'w',
          tickAt,
          transaction: scopeHospitals(transaction, [hospitalAId]),
          jobService,
        }),
      );

    await run();
    await run();
    await run();

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        OR: [
          {
            idempotencyKey: billingPaymentReconcileIdempotencyKey(
              payment.id,
              1,
            ),
          },
          {
            idempotencyKey: billingPaymentReconcileIdempotencyKey(
              payment.id,
              2,
            ),
          },
        ],
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.idempotencyKey).toBe(
      billingPaymentReconcileIdempotencyKey(payment.id, 1),
    );

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('R. concurrent schedulers create exactly one generation 2', async () => {
    const payment = await createPendingPayment(`conc_${runId}`);
    const completedAt = new Date(Date.now() - 20 * 60 * 1000);
    await prisma.job.create({
      data: {
        hospitalId: hospitalAId,
        branchId: null,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 1),
        payload: { paymentId: payment.id },
        status: JobStatus.COMPLETED,
        maxAttempts: 5,
        completedAt,
      },
    });

    const task = new BillingPaymentReconcileSchedulerTask();
    const jobService = new JobService(prisma as never);
    const tickAt = new Date();
    const ctx = {
      windowKey: 'w',
      tickAt,
      jobService,
    };

    await Promise.all([
      prisma.$transaction(async (transaction) =>
        task.run({
          ...ctx,
          transaction: scopeHospitals(transaction, [hospitalAId]),
        }),
      ),
      prisma.$transaction(async (transaction) =>
        task.run({
          ...ctx,
          transaction: scopeHospitals(transaction, [hospitalAId]),
        }),
      ),
    ]);

    const gen2Jobs = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(payment.id, 2),
      },
    });
    expect(gen2Jobs).toHaveLength(1);

    await prisma.job.deleteMany({ where: { hospitalId: hospitalAId } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('K. SUCCEEDED payment excluded from scheduler query → no new job', async () => {
    const payment = await prisma.payment.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        invoiceId: invoiceAId,
        amount: new Prisma.Decimal(100),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: PaymentStatus.SUCCEEDED,
        providerPaymentLinkId: `plink_ok_${runId}`,
        providerPaymentId: `pay_ok_${runId}`,
      },
    });

    const task = new BillingPaymentReconcileSchedulerTask();
    const jobService = new JobService(prisma as never);
    await prisma.$transaction(async (transaction) =>
      task.run({
        windowKey: 'w',
        tickAt: new Date(),
        transaction: scopeHospitals(transaction, [hospitalAId]),
        jobService,
      }),
    );

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        payload: { path: ['paymentId'], equals: payment.id },
      },
    });
    expect(jobs).toHaveLength(0);
    await prisma.payment.delete({ where: { id: payment.id } });
  });

  itWithDb('S. hospital B job history does not affect hospital A generation', async () => {
    const paymentA = await createPendingPayment(`ten_a_${runId}`);

    await prisma.job.create({
      data: {
        hospitalId: hospitalBId,
        branchId: null,
        type: JOB_TYPES.BILLING_PAYMENT_RECONCILE,
        idempotencyKey: billingPaymentReconcileIdempotencyKey(paymentA.id, 5),
        payload: { paymentId: paymentA.id },
        status: JobStatus.COMPLETED,
        maxAttempts: 5,
        completedAt: new Date(),
      },
    });

    const historyA = await loadPaymentReconcileJobHistory(
      prisma,
      hospitalAId,
      paymentA.id,
    );
    expect(historyA).toHaveLength(0);
    expect(decideNextReconciliationGeneration(historyA, new Date())).toBe(1);

    await prisma.job.deleteMany({ where: { hospitalId: hospitalBId } });
    await prisma.payment.delete({ where: { id: paymentA.id } });
  });

  itWithDb('B. first unresolved refund creates generation 1', async () => {
    const payment = await createPendingPayment(`refpay_${runId}`);
    const refund = await prisma.refund.create({
      data: {
        hospitalId: hospitalAId,
        branchId: branchAId,
        paymentId: payment.id,
        amount: new Prisma.Decimal(50),
        currency: 'INR',
        provider: PaymentProvider.RAZORPAY,
        status: RefundStatus.REQUESTED,
      },
    });

    const jobService = new JobService(prisma as never);
    const enqueued = await prisma.$transaction(async (transaction) =>
      tryEnqueueRefundReconcileIfEligible(
        {
          windowKey: 'w',
          tickAt: new Date(),
          transaction,
          jobService,
        },
        hospitalAId,
        refund.id,
      ),
    );

    expect(enqueued).toBe(true);
    const jobs = await prisma.job.findMany({
      where: {
        idempotencyKey: billingRefundReconcileIdempotencyKey(refund.id, 1),
      },
    });
    expect(jobs).toHaveLength(1);

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
    await prisma.refund.delete({ where: { id: refund.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
  });
});
