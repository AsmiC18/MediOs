import {
  AppointmentStatus,
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
} from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from './notification.constants';
import {
  APPOINTMENT_BOOKED_CATEGORY,
  APPOINTMENT_CANCELLED_CATEGORY,
  APPOINTMENT_RESCHEDULED_CATEGORY,
  APPOINTMENT_REMINDER_24H_CATEGORY,
  NOTIFICATION_POLICY_SKIP_REASON,
} from './notification-policy.constants';
import { NotificationPolicyService } from './notification-policy.service';
import { PatientNotificationPreferenceService } from './patient-notification-preference.service';

describe('PatientNotificationPreferenceService (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const service = new PatientNotificationPreferenceService(prisma as never);
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdPatientIds: string[] = [];
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
    if (createdPreferenceIds.length > 0) {
      await prisma.patientNotificationPreference.deleteMany({
        where: { id: { in: createdPreferenceIds } },
      });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdHospitalIds.length > 0) {
      await prisma.hospital.deleteMany({ where: { id: { in: createdHospitalIds } } });
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
      data: { name: `Pref ${suffix}`, code: `PREF-${runId}-${suffix}` },
    });
    createdHospitalIds.push(hospital.id);
    return hospital;
  }

  async function createPatient(hospitalId: string, suffix: string) {
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'Pref',
      },
    });
    createdPatientIds.push(patient.id);
    return patient;
  }

  itWithDb('returns enabled when no preference row exists', async () => {
    const hospital = await createHospital('none');
    const patient = await createPatient(hospital.id, '1');
    expect(
      await service.isWhatsAppTransactionalEnabled(hospital.id, patient.id),
    ).toBe(true);
  });

  itWithDb('returns false when preference disables WhatsApp', async () => {
    const hospital = await createHospital('off');
    const patient = await createPatient(hospital.id, '2');
    const pref = await service.upsertWhatsAppTransactionalEnabled(
      hospital.id,
      patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);
    expect(
      await service.isWhatsAppTransactionalEnabled(hospital.id, patient.id),
    ).toBe(false);
  });

  itWithDb('scopes preference by hospital', async () => {
    const hospitalA = await createHospital('a');
    const hospitalB = await createHospital('b');
    const patientA = await createPatient(hospitalA.id, '3');
    const patientB = await createPatient(hospitalB.id, '4');
    const pref = await service.upsertWhatsAppTransactionalEnabled(
      hospitalA.id,
      patientA.id,
      false,
    );
    createdPreferenceIds.push(pref.id);

    expect(
      await service.isWhatsAppTransactionalEnabled(hospitalA.id, patientA.id),
    ).toBe(false);
    expect(
      await service.isWhatsAppTransactionalEnabled(hospitalB.id, patientB.id),
    ).toBe(true);
  });
});

describe('NotificationPolicyService (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const preferenceService = new PatientNotificationPreferenceService(
    prisma as never,
  );
  const policyService = new NotificationPolicyService(
    prisma as never,
    preferenceService,
  );
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdOutboxIds: string[] = [];
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
    if (createdAppointmentIds.length > 0) {
      await prisma.appointment.deleteMany({
        where: { id: { in: createdAppointmentIds } },
      });
    }
    if (createdPreferenceIds.length > 0) {
      await prisma.patientNotificationPreference.deleteMany({
        where: { id: { in: createdPreferenceIds } },
      });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdHospitalIds.length > 0) {
      await prisma.hospital.deleteMany({ where: { id: { in: createdHospitalIds } } });
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

  async function seedHospitalPatient(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: { name: `Pol ${suffix}`, code: `POL-${runId}-${suffix}` },
    });
    createdHospitalIds.push(hospital.id);
    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'Pol',
      },
    });
    createdPatientIds.push(patient.id);
    return { hospital, patient };
  }

  async function createNotification(input: {
    hospitalId: string;
    patientId: string;
    category: string;
    payload: Record<string, unknown>;
  }) {
    const outbox = await prisma.domainEventOutbox.create({
      data: {
        hospitalId: input.hospitalId,
        eventType: input.category,
        entityType: 'Appointment',
        entityId: 'appt-placeholder',
        idempotencyKey: `pol-outbox:${runId}:${Math.random()}`,
        payload: input.payload,
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
        category: input.category,
        channel: NOTIFICATION_CHANNEL_WHATSAPP,
        payload: {
          source: 'domain_event_outbox',
          eventType: input.category,
          entityType: 'Appointment',
          entityId: input.payload.appointmentId ?? 'appt-placeholder',
          data: input.payload,
        },
        idempotencyKey: `pol-notif:${runId}:${Math.random()}`,
        status: NotificationStatus.PENDING,
      },
    });
    createdNotificationIds.push(notification.id);
    return notification;
  }

  itWithDb('appointment.booked allows when preference enabled', async () => {
    const { hospital, patient } = await seedHospitalPatient('book-allow');
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_BOOKED_CATEGORY,
      payload: { appointmentId: 'a1', patientId: patient.id },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({ action: 'ALLOW' });
  });

  itWithDb('appointment.booked skips when patient opted out', async () => {
    const { hospital, patient } = await seedHospitalPatient('book-skip');
    const pref = await preferenceService.upsertWhatsAppTransactionalEnabled(
      hospital.id,
      patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_BOOKED_CATEGORY,
      payload: { appointmentId: 'a2', patientId: patient.id },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({
      action: 'SKIP',
      reasonCode: NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    });
  });

  itWithDb('reminder allows when appointment still valid', async () => {
    const { hospital, patient } = await seedHospitalPatient('rem-allow');
    const startAt = new Date('2026-11-10T10:00:00.000Z');
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

    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_REMINDER_24H_CATEGORY,
      payload: {
        appointmentId: appointment.id,
        patientId: patient.id,
        scheduledAt: startAt.toISOString(),
      },
    });
    notification.payload = {
      ...(notification.payload as object),
      entityId: appointment.id,
    };

    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({ action: 'ALLOW' });
  });

  itWithDb('reminder skips when appointment cancelled', async () => {
    const { hospital, patient } = await seedHospitalPatient('rem-cancel');
    const startAt = new Date('2026-11-11T10:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: AppointmentStatus.CANCELLED,
      },
    });
    createdAppointmentIds.push(appointment.id);

    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_REMINDER_24H_CATEGORY,
      payload: {
        appointmentId: appointment.id,
        patientId: patient.id,
        scheduledAt: startAt.toISOString(),
      },
    });

    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({
      action: 'SKIP',
      reasonCode: NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_NOT_SCHEDULED,
    });
  });

  itWithDb('appointment.cancelled allows when preference enabled', async () => {
    const { hospital, patient } = await seedHospitalPatient('cancel-allow');
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_CANCELLED_CATEGORY,
      payload: { appointmentId: 'a-cancel-1', patientId: patient.id },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({ action: 'ALLOW' });
  });

  itWithDb('appointment.cancelled skips when patient opted out', async () => {
    const { hospital, patient } = await seedHospitalPatient('cancel-skip');
    const pref = await preferenceService.upsertWhatsAppTransactionalEnabled(
      hospital.id,
      patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_CANCELLED_CATEGORY,
      payload: { appointmentId: 'a-cancel-2', patientId: patient.id },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({
      action: 'SKIP',
      reasonCode: NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    });
  });

  itWithDb('appointment.rescheduled allows when preference enabled', async () => {
    const { hospital, patient } = await seedHospitalPatient('resched-allow');
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_RESCHEDULED_CATEGORY,
      payload: {
        appointmentId: 'a-res-1',
        patientId: patient.id,
        previousScheduledAt: '2026-10-06T10:00:00.000Z',
        scheduledAt: '2026-10-08T10:00:00.000Z',
      },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({ action: 'ALLOW' });
  });

  itWithDb('appointment.rescheduled skips when patient opted out', async () => {
    const { hospital, patient } = await seedHospitalPatient('resched-skip');
    const pref = await preferenceService.upsertWhatsAppTransactionalEnabled(
      hospital.id,
      patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);
    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_RESCHEDULED_CATEGORY,
      payload: { appointmentId: 'a-res-2', patientId: patient.id },
    });
    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({
      action: 'SKIP',
      reasonCode: NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    });
  });

  itWithDb('appointment.cancelled allows when appointment is already cancelled', async () => {
    const { hospital, patient } = await seedHospitalPatient('cancel-appt');
    const startAt = new Date('2026-11-13T10:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status: AppointmentStatus.CANCELLED,
      },
    });
    createdAppointmentIds.push(appointment.id);

    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_CANCELLED_CATEGORY,
      payload: {
        appointmentId: appointment.id,
        patientId: patient.id,
        scheduledAt: startAt.toISOString(),
      },
    });

    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({ action: 'ALLOW' });
  });

  itWithDb('reminder skips when scheduledAt changed', async () => {
    const { hospital, patient } = await seedHospitalPatient('rem-time');
    const startAt = new Date('2026-11-12T10:00:00.000Z');
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: hospital.id,
        patientId: patient.id,
        startAt: new Date('2026-11-14T10:00:00.000Z'),
        endAt: new Date('2026-11-14T10:30:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    });
    createdAppointmentIds.push(appointment.id);

    const notification = await createNotification({
      hospitalId: hospital.id,
      patientId: patient.id,
      category: APPOINTMENT_REMINDER_24H_CATEGORY,
      payload: {
        appointmentId: appointment.id,
        patientId: patient.id,
        scheduledAt: startAt.toISOString(),
      },
    });

    const decision = await policyService.evaluate(notification);
    expect(decision).toEqual({
      action: 'SKIP',
      reasonCode: NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED,
    });
  });
});
