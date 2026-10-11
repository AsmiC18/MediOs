import {
  AppointmentStatus,
  NotificationStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { AppointmentReminderSchedulerTask } from '../../jobs/scheduler/appointment-reminder-scheduler.task';
import { JobService } from '../../jobs/job.service';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import { instantiateNotificationDispatchJobHandler } from '../../notifications/notification-dispatch.handler.test-util';
import { getNotificationPolicyMetadata } from '../../notifications/notification-policy-metadata.util';
import {
  APPOINTMENT_REMINDER_1H_CATEGORY,
  APPOINTMENT_REMINDER_24H_CATEGORY,
  APPOINTMENT_REMINDER_48H_CATEGORY,
  NOTIFICATION_POLICY_SKIP_REASON,
} from '../../notifications/notification-policy.constants';
import { NotificationPolicyService } from '../../notifications/notification-policy.service';
import { NotificationService } from '../../notifications/notification.service';
import { PatientNotificationPreferenceService } from '../../notifications/patient-notification-preference.service';
import {
  APPOINTMENT_REMINDER_1H_EVENT_TYPE,
  APPOINTMENT_REMINDER_48H_EVENT_TYPE,
  APPOINTMENT_REMINDER_1H_OFFSET_MS,
  APPOINTMENT_REMINDER_48H_OFFSET_MS,
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
} from './appointment-reminder-policy.util';
import {
  APPOINTMENT_REMINDER_24H_EVENT_TYPE,
  appointmentReminder24hIdempotencyKey,
  buildAppointmentReminder24hDomainEvent,
} from './appointment-reminder-24h-event.util';
import { appointmentReminderIdempotencyKey } from './appointment-reminder-event.util';
import { resolveAppointmentReminderTimezone } from './appointment-reminder-timezone.util';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';
describe('Appointment reminder H6-D policy metadata (pure)', () => {
  it('classifies 48h, 24h, and 1h as reminders with validation', () => {
    for (const category of [
      APPOINTMENT_REMINDER_48H_CATEGORY,
      APPOINTMENT_REMINDER_24H_CATEGORY,
      APPOINTMENT_REMINDER_1H_CATEGORY,
    ]) {
      const meta = getNotificationPolicyMetadata(category);
      expect(meta.kind).toBe('reminder');
      expect(meta.requiresPatientWhatsAppPreference).toBe(true);
      expect(meta.requiresAppointmentValidation).toBe(true);
    }
  });
});

describe('Appointment reminder H6-D scheduler (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(prisma as never, jobService);
  const schedulerTask = new AppointmentReminderSchedulerTask(outboxService);

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdWorkScheduleIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdJobIds: string[] = [];

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
      await prisma.notification.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.domainEventOutbox.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.appointment.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      if (createdWorkScheduleIds.length > 0) {
        await prisma.workSchedule.deleteMany({
          where: { id: { in: createdWorkScheduleIds } },
        });
      }
      if (createdPatientIds.length > 0) {
        await prisma.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
        });
      }
      if (createdBranchIds.length > 0) {
        await prisma.branch.deleteMany({
          where: { id: { in: createdBranchIds } },
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

  function tickBeforeStart(startAt: Date, offsetMs: number): Date {
    return new Date(startAt.getTime() - offsetMs);
  }

  async function runTick(tickAt: Date) {
    await prisma.$transaction(async (transaction) => {
      await schedulerTask.run({
        windowKey: 'h6d',
        tickAt,
        transaction,
        jobService,
      });
    });
  }

  async function seedHospital(suffix: string, options?: { branchTz?: string; hospitalTz?: string }) {
    const hospital = await prisma.hospital.create({
      data: { name: `H6D ${suffix}`, code: `H6D-${runId}-${suffix}` },
    });
    createdHospitalIds.push(hospital.id);

    let defaultWorkScheduleId: string | undefined;
    if (options?.hospitalTz) {
      const ws = await prisma.workSchedule.create({
        data: {
          hospitalId: hospital.id,
          workStartTime: '09:00',
          workEndTime: '17:00',
          timezone: options.hospitalTz,
        },
      });
      createdWorkScheduleIds.push(ws.id);
      defaultWorkScheduleId = ws.id;
      await prisma.hospital.update({
        where: { id: hospital.id },
        data: { defaultWorkScheduleId: ws.id },
      });
    }

    let branchWorkScheduleId: string | undefined;
    if (options?.branchTz) {
      const ws = await prisma.workSchedule.create({
        data: {
          hospitalId: hospital.id,
          workStartTime: '09:00',
          workEndTime: '17:00',
          timezone: options.branchTz,
        },
      });
      createdWorkScheduleIds.push(ws.id);
      branchWorkScheduleId = ws.id;
    }

    const branch = await prisma.branch.create({
      data: {
        hospitalId: hospital.id,
        name: 'Branch',
        code: `H6DB-${runId}-${suffix}`,
        ...(branchWorkScheduleId ? { workScheduleId: branchWorkScheduleId } : {}),
      },
    });
    createdBranchIds.push(branch.id);

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        phone: `6${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H6D',
      },
    });
    createdPatientIds.push(patient.id);

    return { hospital, branch, patient };
  }

  async function createAppt(
    ctx: Awaited<ReturnType<typeof seedHospital>>,
    startAt: Date,
    status: AppointmentStatus = AppointmentStatus.SCHEDULED,
  ) {
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: ctx.hospital.id,
        branchId: ctx.branch.id,
        patientId: ctx.patient.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
        status,
      },
    });
    createdAppointmentIds.push(appointment.id);
    return appointment;
  }

  itWithDb('creates 48h reminder outbox and dispatch job', async () => {
    const ctx = await seedHospital('48h');
    const startAt = new Date('2026-12-30T14:00:00.000Z');
    const appointment = await createAppt(ctx, startAt);

    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_48H_OFFSET_MS));

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_REMINDER_48H_EVENT_TYPE,
      },
    });
    expect(outbox.entityId).toBe(appointment.id);
    expect(outbox.idempotencyKey).toBe(
      appointmentReminderIdempotencyKey(
        APPOINTMENT_REMINDER_48H_EVENT_TYPE,
        appointment.id,
      ),
    );
    const payload = outbox.payload as Record<string, unknown>;
    expect(payload.scheduledAt).toBe(startAt.toISOString());
    expect(String(payload.text)).toContain('48 hours');

    const job = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outbox.id },
      },
    });
    createdJobIds.push(job.id);
  });

  itWithDb('creates 1h reminder outbox and dispatch job', async () => {
    const ctx = await seedHospital('1h');
    const startAt = new Date('2026-12-31T08:00:00.000Z');
    await createAppt(ctx, startAt);

    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_1H_OFFSET_MS));

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_REMINDER_1H_EVENT_TYPE,
      },
    });
    expect(String((outbox.payload as { text?: string }).text)).toContain(
      '1 hour',
    );
  });

  itWithDb('24h reminder preserves H5 idempotency and text shape', async () => {
    const ctx = await seedHospital('24h');
    const startAt = new Date('2027-01-02T11:00:00.000Z');
    const appointment = await createAppt(ctx, startAt);

    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_24H_OFFSET_MS));

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
      },
    });
    expect(outbox.idempotencyKey).toBe(
      appointmentReminder24hIdempotencyKey(appointment.id),
    );
    expect((outbox.payload as { text?: string }).text).toBe(
      `Reminder: your appointment is scheduled for ${startAt.toISOString()}.`,
    );
  });

  itWithDb('same appointment receives independent 48h, 24h, and 1h reminders', async () => {
    const ctx = await seedHospital('multi');
    const startAt = new Date('2027-02-10T15:00:00.000Z');
    await createAppt(ctx, startAt);

    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_48H_OFFSET_MS));
    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_24H_OFFSET_MS));
    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_1H_OFFSET_MS));

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: { hospitalId: ctx.hospital.id },
    });
    const types = outboxes.map((o) => o.eventType).sort();
    expect(types).toEqual([
      APPOINTMENT_REMINDER_1H_EVENT_TYPE,
      APPOINTMENT_REMINDER_24H_EVENT_TYPE,
      APPOINTMENT_REMINDER_48H_EVENT_TYPE,
    ]);
    const keys = new Set(outboxes.map((o) => o.idempotencyKey));
    expect(keys.size).toBe(3);
  });

  itWithDb('does not create duplicate reminders per offset on repeated ticks', async () => {
    const ctx = await seedHospital('dup');
    const startAt = new Date('2027-02-11T10:00:00.000Z');
    await createAppt(ctx, startAt);
    const tick = tickBeforeStart(startAt, APPOINTMENT_REMINDER_48H_OFFSET_MS);
    await runTick(tick);
    await runTick(tick);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_48H_EVENT_TYPE,
        },
      }),
    ).toBe(1);
  });

  itWithDb('skips terminal statuses and past-due offsets', async () => {
    const ctx = await seedHospital('skip');
    const startAt = new Date('2027-02-12T10:00:00.000Z');
    await createAppt(ctx, startAt, AppointmentStatus.CANCELLED);
    await createAppt(
      ctx,
      new Date(startAt.getTime() + 60_000),
      AppointmentStatus.COMPLETED,
    );

    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_48H_OFFSET_MS));
    expect(await prisma.domainEventOutbox.count({ where: { hospitalId: ctx.hospital.id } })).toBe(0);

    const near = new Date('2027-02-12T10:30:00.000Z');
    await createAppt(ctx, near);
    const tickTooLateFor48h = tickBeforeStart(near, 12 * 60 * 60 * 1000);
    await runTick(tickTooLateFor48h);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_48H_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('resolves branch WorkSchedule timezone before hospital default', async () => {
    const ctx = await seedHospital('tz-branch', {
      branchTz: 'Asia/Kolkata',
      hospitalTz: 'Europe/London',
    });
    await prisma.$transaction(async (tx) => {
      const tz = await resolveAppointmentReminderTimezone(tx, {
        hospitalId: ctx.hospital.id,
        branchId: ctx.branch.id,
      });
      expect(tz).toBe('Asia/Kolkata');
    });
  });

  itWithDb('falls back to hospital default WorkSchedule timezone', async () => {
    const ctx = await seedHospital('tz-hospital', { hospitalTz: 'Europe/Paris' });
    await prisma.$transaction(async (tx) => {
      const tz = await resolveAppointmentReminderTimezone(tx, {
        hospitalId: ctx.hospital.id,
        branchId: ctx.branch.id,
      });
      expect(tz).toBe('Europe/Paris');
    });
  });

  itWithDb('falls back to UTC when no WorkSchedule exists', async () => {
    const ctx = await seedHospital('tz-utc');
    await prisma.$transaction(async (tx) => {
      const tz = await resolveAppointmentReminderTimezone(tx, {
        hospitalId: ctx.hospital.id,
        branchId: ctx.branch.id,
      });
      expect(tz).toBe('UTC');
    });
  });

  itWithDb('stale 24h reminder skipped after reschedule via H6-A', async () => {
    const ctx = await seedHospital('stale');
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const appointmentsService = new AppointmentsService(
      prisma as never,
      auditService as unknown as AuditService,
      outboxService,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      new SchedulingPolicyService(prisma as never),
    );
    const startAt = new Date('2027-03-01T10:00:00.000Z');
    const appointment = await createAppt(ctx, startAt);

    const reminderEvent = buildAppointmentReminder24hDomainEvent({
      id: appointment.id,
      hospitalId: appointment.hospitalId,
      branchId: appointment.branchId,
      patientId: appointment.patientId,
      startAt,
    });
    const { outboxId } = await prisma.$transaction(async (tx) => {
      const row = await outboxService.createInTransaction(tx, reminderEvent);
      await outboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: appointment.hospitalId,
        branchId: appointment.branchId,
        outboxId: row.id,
      });
      return { outboxId: row.id };
    });

    await appointmentsService.update(
      { sub: 'u', hospitalId: ctx.hospital.id, branchId: null },
      appointment.id,
      {
        startAt: '2027-03-03T10:00:00.000Z',
        endAt: '2027-03-03T10:30:00.000Z',
      },
    );

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        payload: { path: ['outboxId'], equals: outboxId },
      },
    });
    createdJobIds.push(dispatchJob.id);

    const notificationService = new NotificationService(prisma as never);
    const preferenceService = new PatientNotificationPreferenceService(
      prisma as never,
    );
    const policyService = new NotificationPolicyService(
      prisma as never,
      preferenceService,
    );
    const dispatchHandler = instantiateNotificationDispatchJobHandler({
      prisma,
      outboxService,
      notificationService,
      policyService,
    });

    await dispatchHandler.handle(dispatchJob, { workerId: 'h6d-stale' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { outboxId },
    });
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED,
    );

    await runTick(
      tickBeforeStart(
        new Date('2027-03-03T10:00:00.000Z'),
        APPOINTMENT_REMINDER_24H_OFFSET_MS,
      ),
    );
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
        },
      }),
    ).toBe(1);
  });

  itWithDb('cancellation race produces no new reminder outbox', async () => {
    const ctx = await seedHospital('cancel-race');
    const startAt = new Date('2027-03-05T09:00:00.000Z');
    const appointment = await createAppt(ctx, startAt);
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED },
    });
    await runTick(tickBeforeStart(startAt, APPOINTMENT_REMINDER_1H_OFFSET_MS));
    expect(await prisma.domainEventOutbox.count({ where: { hospitalId: ctx.hospital.id } })).toBe(0);
  });
});
