import {
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { notificationIdempotencyKeyForOutbox } from './notification-idempotency.util';
import { NotificationService } from './notification.service';

describe('NotificationService (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const service = new NotificationService(prisma as never);
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
        name: `Notif Svc ${suffix}`,
        code: `NSVC-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  itWithDb('createOrGetInTransaction is idempotent on duplicate key', async () => {
    const hospital = await createHospital('idempotent');
    const key = `svc-idem:${runId}`;

    const first = await prisma.$transaction(async (tx) =>
      service.createOrGetInTransaction(tx, {
        hospitalId: hospital.id,
        category: 'test',
        channel: 'unrouted',
        payload: { n: 1 },
        idempotencyKey: key,
      }),
    );
    const second = await prisma.$transaction(async (tx) =>
      service.createOrGetInTransaction(tx, {
        hospitalId: hospital.id,
        category: 'test',
        channel: 'unrouted',
        payload: { n: 2 },
        idempotencyKey: key,
      }),
    );
    createdNotificationIds.push(first.id);

    expect(second.id).toBe(first.id);
    const count = await prisma.notification.count({
      where: { hospitalId: hospital.id, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  itWithDb('findByIdForHospital enforces tenant scope', async () => {
    const hospitalA = await createHospital('find-a');
    const hospitalB = await createHospital('find-b');

    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospitalA.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: `find-tenant:${runId}`,
      },
    });
    createdNotificationIds.push(notification.id);

    expect(
      await service.findByIdForHospital(notification.id, hospitalA.id),
    ).not.toBeNull();
    expect(
      await service.findByIdForHospital(notification.id, hospitalB.id),
    ).toBeNull();
  });

  itWithDb('markDispatched and markFailed update status', async () => {
    const hospital = await createHospital('marks');
    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: `marks:${runId}`,
      },
    });
    createdNotificationIds.push(notification.id);

    const dispatched = await service.markDispatched(
      notification.id,
      hospital.id,
    );
    expect(dispatched.status).toBe(NotificationStatus.DISPATCHED);
    expect(dispatched.dispatchedAt).not.toBeNull();

    const failed = await service.markFailed(
      notification.id,
      hospital.id,
      'test failure',
    );
    expect(failed.status).toBe(NotificationStatus.FAILED);
    expect(failed.lastError).toBe('test failure');
  });

  itWithDb('createOrGetFromOutboxInTransaction uses deterministic idempotency key', async () => {
    const hospital = await createHospital('outbox-key');
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'appointment.booked',
        entityType: 'Appointment',
        entityId: 'appt-1',
        idempotencyKey: `outbox-svc:${runId}`,
        payload: { patientId: null },
        status: DomainEventOutboxStatus.PENDING,
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.$transaction(async (tx) =>
      service.createOrGetFromOutboxInTransaction(tx, outbox),
    );
    createdNotificationIds.push(notification.id);

    expect(notification.idempotencyKey).toBe(
      notificationIdempotencyKeyForOutbox(outbox.id),
    );
    expect(notification.status).toBe(NotificationStatus.PENDING);
    expect(notification.outboxId).toBe(outbox.id);
  });

  itWithDb('createOrGetFromOutboxInTransaction reads whatsapp channel from payload', async () => {
    const hospital = await createHospital('wa-channel');
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'appointment.booked',
        entityType: 'Appointment',
        entityId: 'appt-wa',
        idempotencyKey: `outbox-wa:${runId}`,
        payload: {
          patientId: null,
          channel: 'whatsapp',
          text: 'Hello',
        },
        status: DomainEventOutboxStatus.PENDING,
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.$transaction(async (tx) =>
      service.createOrGetFromOutboxInTransaction(tx, outbox),
    );
    createdNotificationIds.push(notification.id);

    expect(notification.channel).toBe('whatsapp');
  });
});
