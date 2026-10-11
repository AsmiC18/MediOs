import { NotificationStatus, PrismaClient } from '@prisma/client';

describe('Notification schema (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdNotificationIds: string[] = [];
  const createdOutboxIds: string[] = [];
  const createdHospitalIds: string[] = [];

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
    if (createdNotificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
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

  async function createHospital(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: {
        name: `Notification Schema ${suffix}`,
        code: `NOTIF-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  itWithDb('creates Notification with default PENDING status', async () => {
    const hospital = await createHospital('pending');
    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        category: 'test.event',
        channel: 'unrouted',
        payload: { minimal: true },
        idempotencyKey: `notif-schema:${runId}:pending`,
      },
    });
    createdNotificationIds.push(notification.id);

    expect(notification.status).toBe(NotificationStatus.PENDING);
  });

  itWithDb('rejects duplicate hospitalId + idempotencyKey', async () => {
    const hospital = await createHospital('dup');
    const key = `notif-dup:${runId}`;
    const first = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: key,
      },
    });
    createdNotificationIds.push(first.id);

    await expect(
      prisma.notification.create({
        data: {
          hospitalId: hospital.id,
          category: 'test',
          channel: 'unrouted',
          payload: {},
          idempotencyKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itWithDb('allows same idempotencyKey in different hospitals', async () => {
    const hospitalA = await createHospital('ka');
    const hospitalB = await createHospital('kb');
    const sharedKey = `shared-notif:${runId}`;

    const rowA = await prisma.notification.create({
      data: {
        hospitalId: hospitalA.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: sharedKey,
      },
    });
    const rowB = await prisma.notification.create({
      data: {
        hospitalId: hospitalB.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: sharedKey,
      },
    });
    createdNotificationIds.push(rowA.id, rowB.id);

    expect(rowA.idempotencyKey).toBe(rowB.idempotencyKey);
  });

  itWithDb('links Notification to DomainEventOutbox via outboxId', async () => {
    const hospital = await createHospital('link');
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'test.link',
        entityType: 'Test',
        entityId: 'e1',
        idempotencyKey: `outbox-link:${runId}`,
        payload: {},
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        outboxId: outbox.id,
        category: outbox.eventType,
        channel: 'unrouted',
        payload: {},
        idempotencyKey: `notification:${outbox.id}`,
      },
      include: { outbox: true },
    });
    createdNotificationIds.push(notification.id);

    expect(notification.outbox!.id).toBe(outbox.id);
  });
});
