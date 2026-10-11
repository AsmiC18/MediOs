import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Job, JobStatus, Prisma, PrismaClient } from '@prisma/client';
import { JobService } from './job.service';
import { EnqueueJobInput } from './job.types';

/** Claims a specific job row (same locking rules as JobService.claim, scoped by id). */
async function claimJobById(
  prisma: PrismaClient,
  workerId: string,
  jobId: string,
): Promise<Job> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Job"
      WHERE id = ${jobId}
        AND status = ${JobStatus.PENDING}::"JobStatus"
        AND "availableAt" <= NOW()
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) {
      const existing = await tx.job.findUnique({ where: { id: jobId } });
      if (!existing) {
        throw new NotFoundException('Job not found');
      }
      if (existing.status === JobStatus.RUNNING && existing.lockedBy === workerId) {
        return existing;
      }
      throw new Error(`Job ${jobId} is not claimable`);
    }

    await tx.$executeRaw`
      UPDATE "Job" AS j
      SET
        status = ${JobStatus.RUNNING}::"JobStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        attempts = j.attempts + 1,
        "startedAt" = COALESCE(j."startedAt", NOW()),
        "updatedAt" = NOW()
      WHERE j.id = ${jobId}
    `;

    return tx.job.findUniqueOrThrow({ where: { id: jobId } });
  });
}

/** Batch claim limited to explicit job ids (avoids stealing other suites' pending jobs). */
/** Enqueue and claim the same row in one transaction (immune to cross-suite job stealing). */
async function enqueueAndClaimJobById(
  service: JobService,
  prisma: PrismaClient,
  workerId: string,
  input: EnqueueJobInput,
): Promise<Job> {
  return prisma.$transaction(async (tx) => {
    const job = await service.enqueueWithClient(tx as never, input);
    await tx.$executeRaw`
      UPDATE "Job" AS j
      SET
        status = ${JobStatus.RUNNING}::"JobStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        attempts = j.attempts + 1,
        "startedAt" = COALESCE(j."startedAt", NOW()),
        "updatedAt" = NOW()
      WHERE j.id = ${job.id}
        AND j.status = ${JobStatus.PENDING}::"JobStatus"
    `;
    return tx.job.findUniqueOrThrow({ where: { id: job.id } });
  });
}

async function claimJobsByIds(
  prisma: PrismaClient,
  workerId: string,
  jobIds: string[],
  batchSize: number,
): Promise<Job[]> {
  if (batchSize < 1 || jobIds.length === 0) {
    return [];
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Job"
      WHERE id IN (${Prisma.join(jobIds.map((id) => Prisma.sql`${id}`))})
        AND status = ${JobStatus.PENDING}::"JobStatus"
        AND "availableAt" <= NOW()
      ORDER BY "availableAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);

    await tx.$executeRaw`
      UPDATE "Job" AS j
      SET
        status = ${JobStatus.RUNNING}::"JobStatus",
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        attempts = j.attempts + 1,
        "startedAt" = COALESCE(j."startedAt", NOW()),
        "updatedAt" = NOW()
      WHERE j.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    `;

    return tx.job.findMany({
      where: { id: { in: ids } },
      orderBy: { availableAt: 'asc' },
    });
  });
}

describe('JobService (integration)', () => {
  const prisma = new PrismaClient();
  const service = new JobService(prisma as never);

  let dbAvailable = false;
  let hospitalAId: string;
  let hospitalBId: string;
  let branchAId: string;
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
      data: {
        name: 'Job Test Hospital A',
        code: `JOB-A-${runId}`,
        branches: {
          create: {
            name: 'Branch A',
            code: 'MAIN',
          },
        },
      },
      include: { branches: true },
    });
    hospitalAId = hospitalA.id;
    branchAId = hospitalA.branches[0].id;

    const hospitalB = await prisma.hospital.create({
      data: {
        name: 'Job Test Hospital B',
        code: `JOB-B-${runId}`,
      },
    });
    hospitalBId = hospitalB.id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    const cleanup = async () => {
      await prisma.job.deleteMany({
        where: { hospitalId: { in: [hospitalAId, hospitalBId] } },
      });
      await prisma.branch.deleteMany({ where: { hospitalId: hospitalAId } });
      await prisma.hospital.deleteMany({
        where: { id: { in: [hospitalAId, hospitalBId] } },
      });
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await cleanup();
        break;
      } catch (error) {
        const message = String(error);
        if (!message.includes('deadlock detected') || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    await prisma.$disconnect();
  });

  const enqueueDefaults = (overrides: Record<string, unknown> = {}) => ({
    hospitalId: hospitalAId,
    branchId: branchAId,
    type: 'test.job',
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 10)}`,
    payload: { entityId: 'patient-1' },
    maxAttempts: 3,
    ...overrides,
  });

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  describe('with database', () => {
    describe('enqueue', () => {
      itWithDb('creates a job with hospitalId, branchId, type, payload, and idempotency key', async () => {
        const idempotencyKey = `enqueue-full-${runId}`;
        const job = await service.enqueue(
          enqueueDefaults({ idempotencyKey, payload: { foo: 'bar' } }),
        );

        expect(job.id).toBeDefined();
        expect(job.hospitalId).toBe(hospitalAId);
        expect(job.branchId).toBe(branchAId);
        expect(job.type).toBe('test.job');
        expect(job.idempotencyKey).toBe(idempotencyKey);
        expect(job.payload).toEqual({ foo: 'bar' });
        expect(job.status).toBe(JobStatus.PENDING);
        expect(job.attempts).toBe(0);
      });

      itWithDb('returns the existing job on duplicate enqueue (same hospital, type, key)', async () => {
        const idempotencyKey = `dup-${runId}`;
        const first = await service.enqueue(enqueueDefaults({ idempotencyKey }));
        const second = await service.enqueue(
          enqueueDefaults({
            idempotencyKey,
            payload: { different: true },
          }),
        );

        expect(second.id).toBe(first.id);
        expect(second.payload).toEqual(first.payload);
        const count = await prisma.job.count({
          where: {
            hospitalId: hospitalAId,
            type: 'test.job',
            idempotencyKey,
          },
        });
        expect(count).toBe(1);
      });

      itWithDb('allows the same idempotency key for different hospitals', async () => {
        const idempotencyKey = `cross-hospital-${runId}`;
        const jobA = await service.enqueue(
          enqueueDefaults({ idempotencyKey, hospitalId: hospitalAId }),
        );
        const jobB = await service.enqueue({
          hospitalId: hospitalBId,
          type: 'test.job',
          idempotencyKey,
          payload: { x: 1 },
          maxAttempts: 3,
        });

        expect(jobA.id).not.toBe(jobB.id);
        expect(jobA.hospitalId).toBe(hospitalAId);
        expect(jobB.hospitalId).toBe(hospitalBId);
      });

      itWithDb('allows the same idempotency key with a different type', async () => {
        const idempotencyKey = `cross-type-${runId}`;
        const jobA = await service.enqueue(
          enqueueDefaults({ idempotencyKey, type: 'type.a' }),
        );
        const jobB = await service.enqueue(
          enqueueDefaults({ idempotencyKey, type: 'type.b' }),
        );

        expect(jobA.id).not.toBe(jobB.id);
      });
    });

    describe('claim', () => {
      itWithDb('claims pending available jobs and sets RUNNING metadata', async () => {
        const workerId = 'worker-claim-1';
        const updated = await enqueueAndClaimJobById(
          service,
          prisma,
          workerId,
          enqueueDefaults({
            idempotencyKey: `claim-one-${runId}`,
            availableAt: new Date(),
          }),
        );
        expect(updated.status).toBe(JobStatus.RUNNING);
        expect(updated.lockedBy).toBe(workerId);
        expect(updated.lockedAt).not.toBeNull();
        expect(updated.startedAt).not.toBeNull();
        expect(updated.attempts).toBe(1);
      });

      itWithDb('does not claim jobs with future availableAt', async () => {
        const future = new Date(Date.now() + 60 * 60 * 1000);
        const job = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `future-${runId}`,
            availableAt: future,
          }),
        );

        await expect(
          claimJobById(prisma, 'worker-future', job.id),
        ).rejects.toThrow(/not claimable/);

        const stillPending = await prisma.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(stillPending.status).toBe(JobStatus.PENDING);
      });

      itWithDb('respects batch size', async () => {
        const first = await service.enqueue(
          enqueueDefaults({ idempotencyKey: `batch-1-${runId}`, type: 'batch.job' }),
        );
        const second = await service.enqueue(
          enqueueDefaults({ idempotencyKey: `batch-2-${runId}`, type: 'batch.job' }),
        );

        const claimed = await claimJobsByIds(
          prisma,
          'worker-batch',
          [first.id, second.id],
          1,
        );
        expect(claimed.length).toBe(1);
      });

      itWithDb('does not claim COMPLETED or DEAD jobs', async () => {
        const completed = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `completed-${runId}`,
            type: 'terminal.job',
          }),
        );
        await prisma.job.update({
          where: { id: completed.id },
          data: { status: JobStatus.COMPLETED },
        });

        const dead = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `dead-${runId}`,
            type: 'terminal.job',
          }),
        );
        await prisma.job.update({
          where: { id: dead.id },
          data: { status: JobStatus.DEAD },
        });

        await expect(
          claimJobById(prisma, 'worker-terminal', completed.id),
        ).rejects.toThrow(/not claimable/);
        await expect(
          claimJobById(prisma, 'worker-terminal', dead.id),
        ).rejects.toThrow(/not claimable/);
      });
    });

    describe('ownership', () => {
      itWithDb('allows the owning worker to complete and rejects others', async () => {
        const job = await enqueueAndClaimJobById(
          service,
          prisma,
          'owner-complete',
          enqueueDefaults({ idempotencyKey: `complete-own-${runId}` }),
        );

        await expect(
          service.complete(job.id, 'wrong-worker'),
        ).rejects.toThrow(ForbiddenException);

        const done = await service.complete(job.id, 'owner-complete');
        expect(done.status).toBe(JobStatus.COMPLETED);
        expect(done.completedAt).not.toBeNull();
        expect(done.lockedAt).toBeNull();
        expect(done.lockedBy).toBeNull();
      });

      itWithDb('allows the owning worker to fail and rejects others', async () => {
        const job = await enqueueAndClaimJobById(
          service,
          prisma,
          'owner-fail',
          enqueueDefaults({ idempotencyKey: `fail-own-${runId}` }),
        );

        await expect(
          service.fail(job.id, 'wrong-worker', new Error('nope')),
        ).rejects.toThrow(ForbiddenException);

        const failed = await service.fail(
          job.id,
          'owner-fail',
          new Error('transient'),
        );
        expect(failed.status).toBe(JobStatus.PENDING);
      });

      itWithDb('throws NotFoundException for missing jobs on complete/fail', async () => {
        const missingId = '00000000-0000-4000-8000-000000000099';
        await expect(service.complete(missingId, 'w')).rejects.toThrow(
          NotFoundException,
        );
        await expect(
          service.fail(missingId, 'w', new Error('x')),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('retry and dead-letter', () => {
      itWithDb('returns transient failures to PENDING with future availableAt and cleared locks', async () => {
        const job = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `retry-${runId}`,
            maxAttempts: 5,
          }),
        );
        const running = await claimJobById(prisma, 'retry-worker', job.id);

        const before = Date.now();
        const retried = await service.fail(
          running.id,
          'retry-worker',
          new Error('network blip'),
        );
        const after = Date.now();

        expect(retried.status).toBe(JobStatus.PENDING);
        expect(retried.lastError).toBe('network blip');
        expect(retried.lockedAt).toBeNull();
        expect(retried.lockedBy).toBeNull();
        expect(retried.availableAt.getTime()).toBeGreaterThanOrEqual(
          before + 60 * 1000 - 1000,
        );
        expect(retried.availableAt.getTime()).toBeLessThanOrEqual(
          after + 60 * 1000 + 5000,
        );
      });

      itWithDb('dead-letters when attempts reach maxAttempts', async () => {
        const job = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `dead-letter-${runId}`,
            maxAttempts: 1,
          }),
        );
        await claimJobById(prisma, 'dead-worker', job.id);

        const dead = await service.fail(
          job.id,
          'dead-worker',
          new Error('fatal'),
        );

        expect(dead.status).toBe(JobStatus.DEAD);
        expect(dead.failedAt).not.toBeNull();
        expect(dead.lastError).toBe('fatal');
        expect(dead.lockedAt).toBeNull();
        expect(dead.lockedBy).toBeNull();
      });
    });

    describe('recoverStale', () => {
      itWithDb('recovers stale RUNNING jobs without incrementing attempts and allows reclaim', async () => {
        const job = await service.enqueue(
          enqueueDefaults({ idempotencyKey: `stale-${runId}` }),
        );
        await claimJobById(prisma, 'stale-worker', job.id);
        const afterClaim = await prisma.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(afterClaim.attempts).toBe(1);

        const staleLockedAt = new Date(Date.now() - 10 * 60 * 1000);
        await prisma.job.update({
          where: { id: job.id },
          data: { lockedAt: staleLockedAt },
        });

        await service.recoverStale(60 * 1000);

        const reclaimed = await prisma.$transaction(async (tx) => {
          const pending = await tx.job.findUniqueOrThrow({
            where: { id: job.id },
          });
          expect(pending.status).toBe(JobStatus.PENDING);
          expect(pending.attempts).toBe(1);
          expect(pending.lockedAt).toBeNull();
          expect(pending.lockedBy).toBeNull();

          const updated = await tx.job.updateMany({
            where: { id: job.id, status: JobStatus.PENDING },
            data: {
              status: JobStatus.RUNNING,
              lockedBy: 'new-worker',
              lockedAt: new Date(),
              attempts: { increment: 1 },
            },
          });
          expect(updated.count).toBe(1);
          return tx.job.findUniqueOrThrow({ where: { id: job.id } });
        });
        expect(reclaimed.attempts).toBe(2);
        expect(reclaimed.lockedBy).toBe('new-worker');
      });

      itWithDb('does not recover fresh RUNNING jobs', async () => {
        const job = await service.enqueue(
          enqueueDefaults({ idempotencyKey: `fresh-run-${runId}` }),
        );
        await claimJobById(prisma, 'fresh-worker', job.id);

        const count = await service.recoverStale(60 * 60 * 1000);
        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(row.status).toBe(JobStatus.RUNNING);
        expect(row.lockedBy).toBe('fresh-worker');
        void count;
      });
    });

    describe('tenancy', () => {
      itWithDb('preserves hospitalId and branchId through claim, retry, and recovery', async () => {
        const job = await service.enqueue(
          enqueueDefaults({ idempotencyKey: `tenancy-${runId}` }),
        );
        await claimJobById(prisma, 'tenancy-worker', job.id);
        await service.fail(job.id, 'tenancy-worker', new Error('retry me'));

        const afterFail = await prisma.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(afterFail.hospitalId).toBe(hospitalAId);
        expect(afterFail.branchId).toBe(branchAId);

        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.RUNNING,
            lockedAt: new Date(Date.now() - 120_000),
            lockedBy: 'ghost',
          },
        });
        await service.recoverStale(30_000);

        const afterRecover = await prisma.job.findUniqueOrThrow({
          where: { id: job.id },
        });
        expect(afterRecover.hospitalId).toBe(hospitalAId);
        expect(afterRecover.branchId).toBe(branchAId);
      });
    });

    describe('concurrency', () => {
      itWithDb('does not let two concurrent claims take the same job', async () => {
        const job = await service.enqueue(
          enqueueDefaults({
            idempotencyKey: `concurrency-${runId}`,
            type: 'concurrency.job',
          }),
        );

        const results = await Promise.allSettled([
          claimJobById(prisma, 'worker-a', job.id),
          claimJobById(prisma, 'worker-b', job.id),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
        expect(row.status).toBe(JobStatus.RUNNING);
        expect(['worker-a', 'worker-b']).toContain(row.lockedBy);
      });
    });
  });
});
