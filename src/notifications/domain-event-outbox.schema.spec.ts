import {
  DomainEventOutboxStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

describe('DomainEventOutbox schema (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdOutboxIds: string[] = [];
  const createdHospitalIds: string[] = [];
  const createdBranchIds: string[] = [];

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
    if (createdBranchIds.length > 0) {
      await prisma.branch.deleteMany({
        where: { id: { in: createdBranchIds } },
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

  async function createHospital(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: {
        name: `Outbox Test ${suffix}`,
        code: `OUTBOX-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  function sampleEvent(hospitalId: string, key: string) {
    return {
      hospitalId,
      branchId: null,
      eventType: 'test.event',
      entityType: 'TestEntity',
      entityId: `entity-${key}`,
      idempotencyKey: `test:${runId}:${key}`,
      payload: { sample: true },
    };
  }

  itWithDb('creates outbox row with hospital FK and PENDING default', async () => {
    const hospital = await createHospital('create');
    const row = await prisma.domainEventOutbox.create({
      data: sampleEvent(hospital.id, 'create'),
    });
    createdOutboxIds.push(row.id);

    expect(row.status).toBe(DomainEventOutboxStatus.PENDING);
    expect(row.processedAt).toBeNull();

    const loaded = await prisma.domainEventOutbox.findUnique({
      where: { id: row.id },
      include: { hospital: true },
    });
    expect(loaded!.hospital.id).toBe(hospital.id);
  });

  itWithDb('allows null branchId', async () => {
    const hospital = await createHospital('null-branch');
    const row = await prisma.domainEventOutbox.create({
      data: sampleEvent(hospital.id, 'null-branch'),
    });
    createdOutboxIds.push(row.id);
    expect(row.branchId).toBeNull();
  });

  itWithDb('rejects duplicate hospitalId + idempotencyKey with P2002', async () => {
    const hospital = await createHospital('dup-key');
    const data = sampleEvent(hospital.id, 'dup-key');
    const first = await prisma.domainEventOutbox.create({ data });
    createdOutboxIds.push(first.id);

    await expect(
      prisma.domainEventOutbox.create({ data }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itWithDb('allows same idempotencyKey across different hospitals', async () => {
    const hospitalA = await createHospital('hosp-a');
    const hospitalB = await createHospital('hosp-b');
    const sharedKey = `shared-key:${runId}`;

    const rowA = await prisma.domainEventOutbox.create({
      data: {
        ...sampleEvent(hospitalA.id, 'a'),
        idempotencyKey: sharedKey,
      },
    });
    const rowB = await prisma.domainEventOutbox.create({
      data: {
        ...sampleEvent(hospitalB.id, 'b'),
        idempotencyKey: sharedKey,
      },
    });
    createdOutboxIds.push(rowA.id, rowB.id);

    expect(rowA.idempotencyKey).toBe(rowB.idempotencyKey);
    expect(rowA.hospitalId).not.toBe(rowB.hospitalId);
  });
});
