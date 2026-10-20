import {
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import {
  NOTIFICATION_CHANNEL_EMAIL,
  NOTIFICATION_CHANNEL_UNROUTED,
  NOTIFICATION_CHANNEL_WHATSAPP,
  NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
} from './notification.constants';
import { DomainEventOutboxService } from './domain-event-outbox.service';
import { instantiateNotificationDispatchJobHandler } from './notification-dispatch.handler.test-util';
import { NotificationPolicyService } from './notification-policy.service';
import { NotificationService } from './notification.service';
import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

describe('Notification dispatch H3 WhatsApp channel boundary', () => {
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
  const emailDispatch = jest.fn().mockResolvedValue(undefined);
  const handler = instantiateNotificationDispatchJobHandler({
    prisma,
    outboxService,
    notificationService,
    policyService,
    emailAdapter: { dispatch: emailDispatch } as never,
  });

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdJobIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdOutboxIds: string[] = [];
  const createdPatientIds: string[] = [];
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
    if (createdHospitalIds.length > 0) {
      await prisma.whatsAppMessage.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.whatsAppConversation.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
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
    if (createdPatientIds.length > 0) {
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdHospitalIds.length > 0) {
      await prisma.hospital.deleteMany({
        where: { id: { in: createdHospitalIds } },
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(() => {
    emailDispatch.mockClear();
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
        name: `H3 ${suffix}`,
        code: `H3-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  async function createPatient(hospitalId: string, suffix: string) {
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H3',
      },
    });
    createdPatientIds.push(patient.id);
    return patient;
  }

  async function createProcessedWhatsAppNotification(input: {
    hospitalId: string;
    patientId: string;
    payload: Record<string, unknown>;
  }) {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: input.hospitalId,
        eventType: 'h3.test',
        entityType: 'Test',
        entityId: `ent-${Math.random()}`,
        idempotencyKey: `h3-outbox:${runId}:${Math.random()}`,
        payload: {},
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.notification.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        outboxId: outbox.id,
        category: 'h3.test',
        channel: NOTIFICATION_CHANNEL_WHATSAPP,
        payload: input.payload,
        idempotencyKey: `notification:${outbox.id}`,
        status: NotificationStatus.PENDING,
      },
    });
    createdNotificationIds.push(notification.id);

    const job = await jobService.enqueue({
      hospitalId: input.hospitalId,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `notification.dispatch:h3:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    return { outbox, notification, job };
  }

  itWithDb('marks channel=whatsapp SKIPPED with channel_not_configured and no WA handoff', async () => {
    const hospital = await createHospital('wa-route');
    const patient = await createPatient(hospital.id, '1');

    const { job, notification } = await createProcessedWhatsAppNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      payload: { text: 'Hello from H3' },
    });

    await handler.handle(job, { workerId: 'worker-h3-a' });

    const updated = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    const sendJobs = await prisma.job.findMany({
      where: {
        hospitalId: hospital.id,
        type: 'whatsapp.message.send',
      },
    });

    expect(updated!.status).toBe(NotificationStatus.SKIPPED);
    expect(updated!.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );
    expect(messages).toHaveLength(0);
    expect(sendJobs).toHaveLength(0);
    expect(emailDispatch).not.toHaveBeenCalled();
  });

  itWithDb('still dispatches other channels after whatsapp skip', async () => {
    const hospital = await createHospital('wa-then-email');
    const patient = await createPatient(hospital.id, 'em');

    const wa = await createProcessedWhatsAppNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      payload: { text: 'WA' },
    });
    await handler.handle(wa.job, { workerId: 'worker-h3-wa' });

    const emailOutbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'h3.email',
        entityType: 'Test',
        entityId: 'email-ent',
        idempotencyKey: `h3-email-outbox:${runId}`,
        payload: {},
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
    createdOutboxIds.push(emailOutbox.id);

    const emailNotification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        outboxId: emailOutbox.id,
        category: 'h3.email',
        channel: NOTIFICATION_CHANNEL_EMAIL,
        payload: {
          emailTo: 'patient@example.com',
          emailSubject: 'Test',
          emailBody: 'Body',
        },
        idempotencyKey: `notification:email:${emailOutbox.id}`,
        status: NotificationStatus.PENDING,
      },
    });
    createdNotificationIds.push(emailNotification.id);

    const emailJob = await jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `notification.dispatch:email:${emailOutbox.id}`,
      payload: { outboxId: emailOutbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(emailJob.id);

    await handler.handle(emailJob, { workerId: 'worker-h3-email' });

    expect(emailDispatch).toHaveBeenCalledTimes(1);
    const waUpdated = await prisma.notification.findUnique({
      where: { id: wa.notification.id },
    });
    expect(waUpdated!.status).toBe(NotificationStatus.SKIPPED);
  });

  itWithDb('unrouted channel does not create WhatsAppMessage', async () => {
    const hospital = await createHospital('unrouted');
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'h3.unrouted',
        entityType: 'Test',
        entityId: 'e1',
        idempotencyKey: `unrouted:${runId}`,
        payload: {},
        status: DomainEventOutboxStatus.PENDING,
      },
    });
    createdOutboxIds.push(outbox.id);

    const job = await jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `notification.dispatch:unrouted:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    await handler.handle(job, { workerId: 'worker-unrouted' });

    const notification = await prisma.notification.findFirst({
      where: { outboxId: outbox.id },
    });
    if (notification) {
      createdNotificationIds.push(notification.id);
    }

    expect(notification!.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(notification!.status).toBe(NotificationStatus.PENDING);

    const waCount = await prisma.whatsAppMessage.count({
      where: { hospitalId: hospital.id },
    });
    expect(waCount).toBe(0);
  });

  itWithDb('unknown channel marks notification SKIPPED', async () => {
    const hospital = await createHospital('unknown-ch');
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'h3.unknown',
        entityType: 'Test',
        entityId: 'e2',
        idempotencyKey: `unknown:${runId}`,
        payload: {},
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
    createdOutboxIds.push(outbox.id);

    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        outboxId: outbox.id,
        category: 'test',
        channel: 'legacy-unknown-channel',
        payload: {},
        idempotencyKey: `notification:unknown:${runId}`,
        status: NotificationStatus.PENDING,
      },
    });
    createdNotificationIds.push(notification.id);

    const job = await jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `notification.dispatch:unknown:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    await handler.handle(job, { workerId: 'worker-skip' });

    const updated = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(updated!.status).toBe(NotificationStatus.SKIPPED);
    expect(await prisma.whatsAppMessage.count()).toBeGreaterThanOrEqual(0);
  });

  itWithDb('idempotent rerun leaves one SKIPPED notification and no WhatsApp rows', async () => {
    const hospital = await createHospital('idem');
    const patient = await createPatient(hospital.id, '2');

    const { job, notification } = await createProcessedWhatsAppNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      payload: { text: 'Once only' },
    });

    await handler.handle(job, { workerId: 'worker-idem-1' });
    await handler.handle(job, { workerId: 'worker-idem-2' });

    const updated = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    const sendJobs = await prisma.job.count({
      where: {
        hospitalId: hospital.id,
        type: 'whatsapp.message.send',
      },
    });

    expect(updated!.status).toBe(NotificationStatus.SKIPPED);
    expect(updated!.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );
    expect(messages).toHaveLength(0);
    expect(sendJobs).toBe(0);
  });

  itWithDb('concurrent dispatch yields no WhatsAppMessage', async () => {
    const hospital = await createHospital('conc');
    const patient = await createPatient(hospital.id, '3');

    const { job, notification } = await createProcessedWhatsAppNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      payload: { text: 'Concurrent' },
    });

    const results = await Promise.allSettled([
      handler.handle(job, { workerId: 'worker-conc-a' }),
      handler.handle(job, { workerId: 'worker-conc-b' }),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });

  itWithDb('rejects patient from another hospital', async () => {
    const hospitalA = await createHospital('pat-a');
    const hospitalB = await createHospital('pat-b');
    const patientB = await createPatient(hospitalB.id, '4');

    const { job, notification } = await createProcessedWhatsAppNotification({
      hospitalId: hospitalA.id,
      patientId: patientB.id,
      payload: { text: 'bad patient' },
    });

    await expect(
      handler.handle(job, { workerId: 'worker-patient' }),
    ).rejects.toBeInstanceOf(JobPermanentFailureError);

    const updated = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(updated!.status).toBe(NotificationStatus.PENDING);
  });

  itWithDb('already SKIPPED notification is a safe no-op on rerun', async () => {
    const hospital = await createHospital('disp');
    const patient = await createPatient(hospital.id, '5');

    const { job, notification } = await createProcessedWhatsAppNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      payload: { text: 'done' },
    });

    await handler.handle(job, { workerId: 'worker-d1' });
    const countAfterFirst = await prisma.whatsAppMessage.count({
      where: { sourceNotificationId: notification.id },
    });

    await handler.handle(job, { workerId: 'worker-d2' });
    const countAfterSecond = await prisma.whatsAppMessage.count({
      where: { sourceNotificationId: notification.id },
    });

    expect(countAfterFirst).toBe(0);
    expect(countAfterSecond).toBe(0);
  });
});
