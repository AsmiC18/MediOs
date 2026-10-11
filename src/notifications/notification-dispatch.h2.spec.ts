import {
  DomainEventOutboxStatus,
  Job,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { notificationIdempotencyKeyForOutbox } from './notification-idempotency.util';
import { instantiateNotificationDispatchJobHandler } from './notification-dispatch.handler.test-util';
import { NotificationPolicyService } from './notification-policy.service';
import { NotificationService } from './notification.service';
import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

describe('Notification dispatch H2', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(prisma as never, jobService);
  const notificationService = new NotificationService(prisma as never);
  const preferenceService = new PatientNotificationPreferenceService(
    prisma as never,
  );
  const policyService = new NotificationPolicyService(
    prisma as never,
    preferenceService,
  );
  const handler = instantiateNotificationDispatchJobHandler({
    prisma,
    outboxService,
    notificationService,
    policyService,
  });

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdJobIds: string[] = [];
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
    if (createdJobIds.length > 0) {
      await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
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
        name: `Dispatch H2 ${suffix}`,
        code: `NDH2-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  async function createPendingOutbox(hospitalId: string) {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId,
        eventType: 'h2.test',
        entityType: 'Test',
        entityId: `ent-${Math.random()}`,
        idempotencyKey: `h2-outbox:${runId}:${Math.random()}`,
        payload: { minimal: true },
        status: DomainEventOutboxStatus.PENDING,
      },
    });
    createdOutboxIds.push(outbox.id);
    return outbox;
  }

  function dispatchJob(hospitalId: string, outboxId: string): Promise<Job> {
    return jobService.enqueue({
      hospitalId,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `notification.dispatch:h2:${outboxId}`,
      payload: { outboxId },
      maxAttempts: 5,
    });
  }

  itWithDb('PENDING outbox creates Notification and marks outbox PROCESSED', async () => {
    const hospital = await createHospital('persist');
    const outbox = await createPendingOutbox(hospital.id);
    const job = await dispatchJob(hospital.id, outbox.id);
    createdJobIds.push(job.id);

    await handler.handle(job, { workerId: 'worker-h2-1' });

    const outboxAfter = await prisma.domainEventOutbox.findUnique({
      where: { id: outbox.id },
    });
    const notification = await prisma.notification.findFirst({
      where: { outboxId: outbox.id, hospitalId: hospital.id },
    });

    expect(outboxAfter!.status).toBe(DomainEventOutboxStatus.PROCESSED);
    expect(notification).not.toBeNull();
    expect(notification!.status).toBe(NotificationStatus.PENDING);
    expect(notification!.idempotencyKey).toBe(
      notificationIdempotencyKeyForOutbox(outbox.id),
    );
    if (notification) {
      createdNotificationIds.push(notification.id);
    }
  });

  itWithDb('second execution does not duplicate Notification', async () => {
    const hospital = await createHospital('rerun');
    const outbox = await createPendingOutbox(hospital.id);
    const job = await dispatchJob(hospital.id, outbox.id);
    createdJobIds.push(job.id);

    await handler.handle(job, { workerId: 'worker-h2-2a' });
    await handler.handle(job, { workerId: 'worker-h2-2b' });

    const notifications = await prisma.notification.findMany({
      where: { hospitalId: hospital.id, outboxId: outbox.id },
    });
    notifications.forEach((n) => createdNotificationIds.push(n.id));

    expect(notifications).toHaveLength(1);
  });

  itWithDb('cross-hospital job rejects without creating notification', async () => {
    const hospitalA = await createHospital('cross-a');
    const hospitalB = await createHospital('cross-b');
    const outboxB = await createPendingOutbox(hospitalB.id);

    const job = await dispatchJob(hospitalA.id, outboxB.id);
    createdJobIds.push(job.id);

    await expect(
      handler.handle(job, { workerId: 'worker-cross' }),
    ).rejects.toBeInstanceOf(JobPermanentFailureError);

    const outboxAfter = await prisma.domainEventOutbox.findUnique({
      where: { id: outboxB.id },
    });
    const notificationCount = await prisma.notification.count({
      where: { outboxId: outboxB.id },
    });

    expect(outboxAfter!.status).toBe(DomainEventOutboxStatus.PENDING);
    expect(notificationCount).toBe(0);
  });

  itWithDb('does not create WhatsAppMessage rows', async () => {
    const hospital = await createHospital('no-wa');
    const outbox = await createPendingOutbox(hospital.id);
    const before = await prisma.whatsAppMessage.count({
      where: { hospitalId: hospital.id },
    });

    const job = await dispatchJob(hospital.id, outbox.id);
    createdJobIds.push(job.id);
    await handler.handle(job, { workerId: 'worker-nowa' });

    const after = await prisma.whatsAppMessage.count({
      where: { hospitalId: hospital.id },
    });
    expect(after).toBe(before);

    const notification = await prisma.notification.findFirst({
      where: { outboxId: outbox.id },
    });
    if (notification) {
      createdNotificationIds.push(notification.id);
    }
  });

  itWithDb('DB failure during notification create leaves outbox PENDING', async () => {
    const hospital = await createHospital('db-fail');
    const outbox = await createPendingOutbox(hospital.id);

    const brokenNotificationService = new NotificationService(prisma as never);
    jest
      .spyOn(brokenNotificationService, 'createOrGetFromOutboxInTransaction')
      .mockRejectedValueOnce(new Error('simulated db failure'));

    const failingHandler = instantiateNotificationDispatchJobHandler({
      prisma,
      outboxService,
      notificationService: brokenNotificationService,
      policyService,
    });

    const job = await dispatchJob(hospital.id, outbox.id);
    createdJobIds.push(job.id);

    await expect(
      failingHandler.handle(job, { workerId: 'worker-fail' }),
    ).rejects.toThrow('simulated db failure');

    const outboxAfter = await prisma.domainEventOutbox.findUnique({
      where: { id: outbox.id },
    });
    expect(outboxAfter!.status).toBe(DomainEventOutboxStatus.PENDING);

    jest.restoreAllMocks();
  });

  itWithDb('enqueueDispatchInTransaction commits outbox and job atomically', async () => {
    const hospital = await createHospital('enqueue-tx');
    let outboxId = '';

    await prisma.$transaction(async (tx) => {
      const outbox = await outboxService.createInTransaction(tx, {
        hospitalId: hospital.id,
        eventType: 'h2.enqueue',
        entityType: 'Test',
        entityId: 'e-enqueue',
        idempotencyKey: `enqueue-tx:${runId}`,
        payload: {},
      });
      outboxId = outbox.id;
      createdOutboxIds.push(outbox.id);

      const job = await outboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: hospital.id,
        outboxId: outbox.id,
      });
      createdJobIds.push(job.id);
    });

    const job = await prisma.job.findFirst({
      where: {
        hospitalId: hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outboxId}`,
      },
    });

    expect(job).not.toBeNull();
    expect(job!.payload).toEqual({ outboxId });
  });

  itWithDb('same notification idempotency key works across hospitals', async () => {
    const hospitalA = await createHospital('idem-a');
    const hospitalB = await createHospital('idem-b');
    const sharedSuffix = 'appointment.booked:shared-entity';

    const outboxA = await createPendingOutbox(hospitalA.id);
    const outboxB = await createPendingOutbox(hospitalB.id);

    const keyA = notificationIdempotencyKeyForOutbox(outboxA.id);
    const keyB = notificationIdempotencyKeyForOutbox(outboxB.id);

    await prisma.$transaction(async (tx) => {
      const nA = await notificationService.createOrGetInTransaction(tx, {
        hospitalId: hospitalA.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: sharedSuffix,
      });
      createdNotificationIds.push(nA.id);
    });
    await prisma.$transaction(async (tx) => {
      const nB = await notificationService.createOrGetInTransaction(tx, {
        hospitalId: hospitalB.id,
        category: 'test',
        channel: 'unrouted',
        payload: {},
        idempotencyKey: sharedSuffix,
      });
      createdNotificationIds.push(nB.id);
    });

    expect(keyA).not.toBe(keyB);
  });
});
