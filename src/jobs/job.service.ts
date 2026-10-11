import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Job, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { computeRetryAvailableAt } from './job-backoff.util';
import { truncateJobError } from './job-error.util';
import { createHash } from 'crypto';
import { EnqueueJobInput } from './job.types';

function isRootPrismaClient(
  client: PrismaService | Prisma.TransactionClient,
): client is PrismaService {
  return typeof (client as PrismaService).$connect === 'function';
}

function enqueueSavepointName(input: EnqueueJobInput): string {
  const hash = createHash('sha256')
    .update(`${input.hospitalId}|${input.type}|${input.idempotencyKey}`)
    .digest('hex')
    .slice(0, 16);
  return `enq_${hash}`;
}

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    return this.enqueueWithClient(this.prisma, input);
  }

  /** Enqueue within an existing Prisma client/transaction (used by scheduler leader tick). */
  async enqueueWithClient(
    client: PrismaService | Prisma.TransactionClient,
    input: EnqueueJobInput,
  ): Promise<Job> {
    if (isRootPrismaClient(client)) {
      return this.createOrReturnExistingJob(client, input);
    }

    const availableAt = input.availableAt ?? new Date();
    const savepoint = enqueueSavepointName(input);
    await client.$executeRaw(Prisma.raw(`SAVEPOINT "${savepoint}"`));

    try {
      const created = await client.job.create({
        data: {
          hospitalId: input.hospitalId,
          branchId: input.branchId ?? null,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
          maxAttempts: input.maxAttempts,
          availableAt,
        },
      });
      await client.$executeRaw(Prisma.raw(`RELEASE SAVEPOINT "${savepoint}"`));
      return created;
    } catch (error) {
      await client.$executeRaw(
        Prisma.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`),
      );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await client.job.findUnique({
          where: {
            hospitalId_type_idempotencyKey: {
              hospitalId: input.hospitalId,
              type: input.type,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async createOrReturnExistingJob(
    client: PrismaService | Prisma.TransactionClient,
    input: EnqueueJobInput,
  ): Promise<Job> {
    const availableAt = input.availableAt ?? new Date();

    try {
      return await client.job.create({
        data: {
          hospitalId: input.hospitalId,
          branchId: input.branchId ?? null,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
          maxAttempts: input.maxAttempts,
          availableAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await client.job.findUnique({
          where: {
            hospitalId_type_idempotencyKey: {
              hospitalId: input.hospitalId,
              type: input.type,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async claim(workerId: string, batchSize = 1): Promise<Job[]> {
    if (batchSize < 1) {
      return [];
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "Job"
        WHERE status = ${JobStatus.PENDING}::"JobStatus"
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

  async complete(jobId: string, workerId: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.RUNNING || job.lockedBy !== workerId) {
      throw new ForbiddenException('Job is not owned by this worker');
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async dead(jobId: string, workerId: string, error: unknown): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.RUNNING || job.lockedBy !== workerId) {
      throw new ForbiddenException('Job is not owned by this worker');
    }

    const lastError = truncateJobError(error);

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.DEAD,
        failedAt: new Date(),
        lastError,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async fail(jobId: string, workerId: string, error: unknown): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.RUNNING || job.lockedBy !== workerId) {
      throw new ForbiddenException('Job is not owned by this worker');
    }

    const lastError = truncateJobError(error);

    if (job.attempts >= job.maxAttempts) {
      return this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.DEAD,
          failedAt: new Date(),
          lastError,
          lockedAt: null,
          lockedBy: null,
        },
      });
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PENDING,
        availableAt: computeRetryAvailableAt(job.attempts),
        lastError,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async recoverStale(leaseDurationMs: number): Promise<number> {
    const staleBefore = new Date(Date.now() - leaseDurationMs);
    const result = await this.prisma.job.updateMany({
      where: {
        status: JobStatus.RUNNING,
        lockedAt: { lt: staleBefore },
      },
      data: {
        status: JobStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return result.count;
  }
}
