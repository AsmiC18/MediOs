import {
  AppointmentStatus,
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { JobService } from '../jobs/job.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import {
  APPOINTMENT_REMINDER_24H_CATEGORY,
  NOTIFICATION_POLICY_SKIP_REASON,
} from './notification-policy.constants';
import { createNotificationDispatchHandlerTestStack } from './notification-dispatch.handler.test-util';

describe('Notification dispatch H6-A policy', () => {
  const prisma = new PrismaClient();
  const stack = createNotificationDispatchHandlerTestStack(prisma);
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdPreferenceIds: string[] = [];

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
      await prisma.job.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.whatsAppMessage.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.notification.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.domainEventOutbox.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      if (createdPreferenceIds.length > 0) {
        await prisma.patientNotificationPreference.deleteMany({
          where: { id: { in: createdPreferenceIds } },
        });
      }
      if (createdAppointmentIds.length > 0) {
        await prisma.appointment.deleteMany({
          where: { id: { in: createdAppointmentIds } },
        });
      }
      if (createdPatientIds.length > 0) {
        await prisma.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
        });
      }
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

  async function seedContext(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: { name: `H6A ${suffix}`, code: `H6A-${runId}-${suffix}` },
    });
    createdHospitalIds.push(hospital.id);
    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H6A',
      },
    });
    createdPatientIds.push(patient.id);
    await prisma.whatsAppConfig.create({
      data: {
        hospitalId: hospital.id,
        phoneNumberId: `phone-h6a-${runId}-${suffix}`,
        accessToken: 'test-token',
        enabled: true,
      },
    });
    return { hospital, patient };
  }

  itWithDb('policy SKIP creates no WhatsAppMessage or send job', async () => {
    const { hospital, patient } = await seedContext('skip');
    const startAt = new Date('2026-11-20T09:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        startAt: new Date('2026-11-22T09:00:00.000Z'),
        endAt: new Date('2026-11-22T09:30:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    });
    createdAppointmentIds.push(appointment.id);

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: APPOINTMENT_REMINDER_24H_CATEGORY,
        entityType: 'Appointment',
        entityId: appointment.id,
        idempotencyKey: `h6a-skip:${runId}`,
        payload: {
          appointmentId: appointment.id,
          patientId: patient.id,
          hospitalId: hospital.id,
          scheduledAt: startAt.toISOString(),
          channel: 'whatsapp',
          text: 'Reminder',
        },
        status: DomainEventOutboxStatus.PENDING,
      },
    });

    const job = await stack.jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `h6a-dispatch:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    await stack.handler.handle(job, { workerId: 'worker-h6a-skip' });

    const notification = await prisma.notification.findFirst({
      where: { outboxId: outbox.id },
    });
    expect(notification!.status).toBe(NotificationStatus.SKIPPED);
    expect(notification!.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED,
    );
    expect(
      await prisma.whatsAppMessage.count({ where: { hospitalId: hospital.id } }),
    ).toBe(0);
    expect(
      await prisma.job.count({
        where: {
          hospitalId: hospital.id,
          type: 'whatsapp.message.send',
        },
      }),
    ).toBe(0);
  });

  itWithDb('opt-out skips booked notification without WhatsApp handoff', async () => {
    const { hospital, patient } = await seedContext('optout');
    const pref = await stack.preferenceService.upsertWhatsAppTransactionalEnabled(
      hospital.id,
      patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: 'appointment.booked',
        entityType: 'Appointment',
        entityId: 'appt-optout',
        idempotencyKey: `h6a-optout:${runId}`,
        payload: {
          appointmentId: 'appt-optout',
          patientId: patient.id,
          channel: 'whatsapp',
          text: 'Booked',
        },
        status: DomainEventOutboxStatus.PENDING,
      },
    });

    const job = await stack.jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `h6a-dispatch-opt:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    await stack.handler.handle(job, { workerId: 'worker-h6a-opt' });

    const notification = await prisma.notification.findFirst({
      where: { outboxId: outbox.id },
    });
    expect(notification!.status).toBe(NotificationStatus.SKIPPED);
    expect(notification!.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    );
  });

  itWithDb('already DISPATCHED notification is unchanged on rerun', async () => {
    const { hospital, patient } = await seedContext('disp');
    const startAt = new Date('2026-11-21T11:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: AppointmentStatus.SCHEDULED,
      },
    });
    createdAppointmentIds.push(appointment.id);

    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: hospital.id,
        eventType: APPOINTMENT_REMINDER_24H_CATEGORY,
        entityType: 'Appointment',
        entityId: appointment.id,
        idempotencyKey: `h6a-disp:${runId}`,
        payload: {
          appointmentId: appointment.id,
          patientId: patient.id,
          scheduledAt: startAt.toISOString(),
          channel: 'whatsapp',
          text: 'Reminder',
        },
        status: DomainEventOutboxStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    const notification = await prisma.notification.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        outboxId: outbox.id,
        category: APPOINTMENT_REMINDER_24H_CATEGORY,
        channel: 'whatsapp',
        payload: {},
        idempotencyKey: `h6a-notif-disp:${runId}`,
        status: NotificationStatus.DISPATCHED,
        dispatchedAt: new Date(),
      },
    });

    const job = await stack.jobService.enqueue({
      hospitalId: hospital.id,
      type: JOB_TYPES.NOTIFICATION_DISPATCH,
      idempotencyKey: `h6a-dispatch-disp:${outbox.id}`,
      payload: { outboxId: outbox.id },
      maxAttempts: 5,
    });
    createdJobIds.push(job.id);

    await stack.handler.handle(job, { workerId: 'worker-h6a-disp' });

    const after = await prisma.notification.findUnique({
      where: { id: notification.id },
    });
    expect(after!.status).toBe(NotificationStatus.DISPATCHED);
  });
});
