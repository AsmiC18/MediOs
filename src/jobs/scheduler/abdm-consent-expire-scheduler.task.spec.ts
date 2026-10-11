jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: { forRoot: jest.fn() },
  SchedulerRegistry: jest.fn(),
}));

import { Prisma, PrismaClient } from '@prisma/client';
import { JobService } from '../job.service';
import { JOB_TYPES } from '../job-types.constants';
import { AbdmConsentExpireSchedulerTask } from './abdm-consent-expire-scheduler.task';
import { formatUtcHourWindow } from './scheduler-window.util';

/** Limits hospital discovery to fixture rows (avoids parallel-test DB pollution). */
function scopeSchedulerTransactionToHospitals(
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

describe('AbdmConsentExpireSchedulerTask', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  let hospitalAId: string;
  let hospitalBId: string;
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
      data: { name: 'Consent Sched A', code: `CONS-A-${runId}` },
    });
    const hospitalB = await prisma.hospital.create({
      data: { name: 'Consent Sched B', code: `CONS-B-${runId}` },
    });
    hospitalAId = hospitalA.id;
    hospitalBId = hospitalB.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { type: JOB_TYPES.ABDM_CONSENT_EXPIRE },
    });
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

  itWithDb('enqueues one job per hospital with trusted hospitalId and hour idempotency key', async () => {
    const task = new AbdmConsentExpireSchedulerTask();
    const jobService = new JobService(prisma as never);
    const tickAt = new Date('2026-10-04T18:15:00Z');
    const windowKey = formatUtcHourWindow(tickAt);

    await prisma.$transaction(async (transaction) => {
      await task.run({
        windowKey,
        tickAt,
        transaction: scopeSchedulerTransactionToHospitals(transaction, [
          hospitalAId,
          hospitalBId,
        ]),
        jobService,
      });
    });

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: { in: [hospitalAId, hospitalBId] },
        type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
        idempotencyKey: {
          endsWith: `:${windowKey}`,
        },
      },
    });

    const hospitalIds = new Set(jobs.map((job) => job.hospitalId));
    expect(hospitalIds.has(hospitalAId)).toBe(true);
    expect(hospitalIds.has(hospitalBId)).toBe(true);
    expect(jobs.every((job) => job.branchId === null)).toBe(true);
    expect(
      jobs.find((job) => job.hospitalId === hospitalAId)?.idempotencyKey,
    ).toBe(`${JOB_TYPES.ABDM_CONSENT_EXPIRE}:${hospitalAId}:${windowKey}`);

    await prisma.job.deleteMany({
      where: { id: { in: jobs.map((job) => job.id) } },
    });
  });

  itWithDb('does not duplicate jobs for the same hospital and hour window', async () => {
    const task = new AbdmConsentExpireSchedulerTask();
    const jobService = new JobService(prisma as never);
    const tickAt = new Date('2026-10-04T19:00:00Z');
    const windowKey = formatUtcHourWindow(tickAt);

    const scopedHospitalIds = [hospitalAId, hospitalBId];
    await prisma.$transaction(async (transaction) => {
      await task.run({
        windowKey,
        tickAt,
        transaction: scopeSchedulerTransactionToHospitals(
          transaction,
          scopedHospitalIds,
        ),
        jobService,
      });
    });
    await prisma.$transaction(async (transaction) => {
      await task.run({
        windowKey,
        tickAt,
        transaction: scopeSchedulerTransactionToHospitals(
          transaction,
          scopedHospitalIds,
        ),
        jobService,
      });
    });

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: hospitalAId,
        type: JOB_TYPES.ABDM_CONSENT_EXPIRE,
        idempotencyKey: `${JOB_TYPES.ABDM_CONSENT_EXPIRE}:${hospitalAId}:${windowKey}`,
      },
    });
    expect(jobs).toHaveLength(1);

    await prisma.job.deleteMany({ where: { id: jobs[0].id } });
  });
});
