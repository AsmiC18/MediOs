import { Prisma, PrismaClient } from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { DomainEventOutboxService } from './domain-event-outbox.service';

describe('DomainEventOutbox transactional creation (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(
    prisma as never,
    jobService,
  );
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    if (createdOutboxIds.length > 0) {
      await prisma.domainEventOutbox.deleteMany({
        where: { id: { in: createdOutboxIds } },
      });
    }
    if (createdHospitalIds.length > 0) {
      await prisma.hospital.deleteMany({
        where: { id: { in: createdHospitalIds } },
      });
    }
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

  itWithDb('commits business marker and outbox together', async () => {
    const markerCode = `TX-OK-${runId}`;
    let outboxId = '';

    await prisma.$transaction(async (tx) => {
      const hospital = await tx.hospital.create({
        data: {
          name: 'Tx Commit Hospital',
          code: markerCode,
        },
      });
      createdHospitalIds.push(hospital.id);

      const outbox = await outboxService.createInTransaction(tx, {
        hospitalId: hospital.id,
        eventType: 'test.commit',
        entityType: 'Hospital',
        entityId: hospital.id,
        idempotencyKey: `tx-commit:${runId}`,
        payload: { marker: markerCode },
      });
      outboxId = outbox.id;
      createdOutboxIds.push(outbox.id);
    });

    const hospital = await prisma.hospital.findUnique({
      where: { code: markerCode },
    });
    const outbox = await prisma.domainEventOutbox.findUnique({
      where: { id: outboxId },
    });

    expect(hospital).not.toBeNull();
    expect(outbox).not.toBeNull();
    expect(outbox!.hospitalId).toBe(hospital!.id);
  });

  itWithDb('rolls back outbox when transaction aborts', async () => {
    const markerCode = `TX-ROLL-${runId}`;
    let outboxId = '';

    await expect(
      prisma.$transaction(async (tx) => {
        const hospital = await tx.hospital.create({
          data: {
            name: 'Tx Rollback Hospital',
            code: markerCode,
          },
        });
        createdHospitalIds.push(hospital.id);

        const outbox = await outboxService.createInTransaction(tx, {
          hospitalId: hospital.id,
          eventType: 'test.rollback',
          entityType: 'Hospital',
          entityId: hospital.id,
          idempotencyKey: `tx-rollback:${runId}`,
          payload: {},
        });
        outboxId = outbox.id;

        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const hospital = await prisma.hospital.findUnique({
      where: { code: markerCode },
    });
    const outbox = outboxId
      ? await prisma.domainEventOutbox.findUnique({ where: { id: outboxId } })
      : null;

    expect(hospital).toBeNull();
    expect(outbox).toBeNull();
  });

  itWithDb('rolls back business write when outbox insert fails', async () => {
    const markerCode = `TX-FK-${runId}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const hospital = await tx.hospital.create({
          data: {
            name: 'Tx Outbox Fail Hospital',
            code: markerCode,
          },
        });
        createdHospitalIds.push(hospital.id);

        await outboxService.createInTransaction(tx, {
          hospitalId: '00000000-0000-0000-0000-000000000000',
          eventType: 'test.invalid_fk',
          entityType: 'Hospital',
          entityId: hospital.id,
          idempotencyKey: `tx-fk-fail:${runId}`,
          payload: {},
        });
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const hospital = await prisma.hospital.findUnique({
      where: { code: markerCode },
    });
    expect(hospital).toBeNull();
  });
});
