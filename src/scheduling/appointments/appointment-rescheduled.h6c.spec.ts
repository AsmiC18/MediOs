import {
  NotificationStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { JobService } from '../../jobs/job.service';
import { JOB_TYPES } from '../../jobs/job-types.constants';
import { DomainEventOutboxService } from '../../notifications/domain-event-outbox.service';
import {
  NOTIFICATION_CHANNEL_WHATSAPP,
  NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
} from '../../notifications/notification.constants';
import { instantiateNotificationDispatchJobHandler } from '../../notifications/notification-dispatch.handler.test-util';
import { NotificationPolicyService } from '../../notifications/notification-policy.service';
import { NotificationService } from '../../notifications/notification.service';
import {
  NOTIFICATION_POLICY_SKIP_REASON,
  APPOINTMENT_RESCHEDULED_CATEGORY,
} from '../../notifications/notification-policy.constants';
import { PatientNotificationPreferenceService } from '../../notifications/patient-notification-preference.service';
import {
  APPOINTMENT_ENTITY_TYPE,
  APPOINTMENT_BOOKED_EVENT_TYPE,
} from './appointment-booked-event.util';
import {
  APPOINTMENT_REMINDER_24H_EVENT_TYPE,
  buildAppointmentReminder24hDomainEvent,
} from './appointment-reminder-24h-event.util';
import {
  APPOINTMENT_RESCHEDULED_EVENT_TYPE,
  appointmentRescheduledIdempotencyKey,
} from './appointment-rescheduled-event.util';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';

describe('Appointment rescheduled H6-C producer', () => {
  const prisma = new PrismaClient();
  const jobService = new JobService(prisma as never);
  const outboxService = new DomainEventOutboxService(prisma as never, jobService);
  const notificationService = new NotificationService(prisma as never);
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
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

  let appointmentsService: AppointmentsService;

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdResourceIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdConfigIds: string[] = [];
  const createdPreferenceIds: string[] = [];

  const hospitalUser = {
    sub: 'user-h6c',
    hospitalId: '',
    branchId: null as string | null,
  };

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
    try {
      if (createdHospitalIds.length > 0) {
        await prisma.job.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.patientNotificationPreference.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.notification.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.domainEventOutbox.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.appointmentResource.deleteMany({
          where: {
            appointment: { hospitalId: { in: createdHospitalIds } },
          },
        });
        await prisma.appointment.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.whatsAppMessage.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.whatsAppConversation.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        await prisma.whatsAppConfig.deleteMany({
          where: { hospitalId: { in: createdHospitalIds } },
        });
        if (createdResourceIds.length > 0) {
          await prisma.resource.deleteMany({
            where: { id: { in: createdResourceIds } },
          });
        }
      }
    } finally {
      if (createdPatientIds.length > 0) {
        await prisma.patientNotificationPreference.deleteMany({
          where: { patientId: { in: createdPatientIds } },
        });
        await prisma.whatsAppMessage.deleteMany({
          where: { patientId: { in: createdPatientIds } },
        });
        await prisma.whatsAppConversation.deleteMany({
          where: { patientId: { in: createdPatientIds } },
        });
        await prisma.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
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
    }
  });

  beforeEach(() => {
    auditService.log.mockClear();
    appointmentsService = new AppointmentsService(
      prisma as never,
      auditService as unknown as AuditService,
      outboxService,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      new SchedulingPolicyService(prisma as never),
    );
  });

  /** Keeps notification.dispatch jobs off the global claim queue until the test is ready. */
  async function holdDispatchJobUntilReady(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        availableAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  }

  async function releaseDispatchJobForHandling(jobId: string): Promise<void> {
    await prisma.job.update({
      where: { id: jobId },
      data: { availableAt: new Date() },
    });
  }

  const itWithDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function seedSchedulingContext(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: {
        name: `H6C ${suffix}`,
        code: `H6C-${runId}-${suffix}`,
      },
    });
    createdHospitalIds.push(hospital.id);
    hospitalUser.hospitalId = hospital.id;

    const branch = await prisma.branch.create({
      data: {
        hospitalId: hospital.id,
        name: 'Main',
        code: `BR-${runId}-${suffix}`,
      },
    });
    createdBranchIds.push(branch.id);

    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        phone: `7${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H6C',
      },
    });
    createdPatientIds.push(patient.id);

    const resource = await prisma.resource.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        type: ResourceType.DOCTOR,
        name: `Dr H6C ${suffix}`,
        status: ResourceStatus.ACTIVE,
      },
    });
    createdResourceIds.push(resource.id);

    const config = await prisma.whatsAppConfig.create({
      data: {
        hospitalId: hospital.id,
        phoneNumberId: `phone-h6c-${runId}-${suffix}`,
        accessToken: 'test-token-h6c',
        enabled: true,
      },
    });
    createdConfigIds.push(config.id);

    return { hospital, branch, patient, resource };
  }

  async function createAppointmentAt(
    ctx: Awaited<ReturnType<typeof seedSchedulingContext>>,
    startAt: string,
    endAt: string,
  ) {
    const appointment = await appointmentsService.create(hospitalUser, {
      patientId: ctx.patient.id,
      branchId: ctx.branch.id,
      resourceIds: [ctx.resource.id],
      startAt,
      endAt,
    });
    createdAppointmentIds.push(appointment.id);
    return appointment;
  }

  const originalStart = '2026-10-06T10:00:00.000Z';
  const originalEnd = '2026-10-06T10:30:00.000Z';
  const rescheduledStart1 = '2026-10-07T10:00:00.000Z';
  const rescheduledEnd1 = '2026-10-07T10:30:00.000Z';
  const rescheduledStart2 = '2026-10-08T10:00:00.000Z';
  const rescheduledEnd2 = '2026-10-08T10:30:00.000Z';

  itWithDb('schedule change creates outbox, payload, and notification.dispatch job', async () => {
    const ctx = await seedSchedulingContext('prod');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    const updated = await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });
    expect(updated.startAt.toISOString()).toBe(rescheduledStart1);

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);
    expect(outboxes[0].entityType).toBe(APPOINTMENT_ENTITY_TYPE);
    expect(outboxes[0].entityId).toBe(created.id);
    expect(outboxes[0].hospitalId).toBe(created.hospitalId);
    expect(outboxes[0].branchId).toBe(created.branchId);
    expect(outboxes[0].idempotencyKey).toBe(
      appointmentRescheduledIdempotencyKey(
        created.id,
        new Date(rescheduledStart1),
      ),
    );

    const payload = outboxes[0].payload as Record<string, unknown>;
    expect(payload.appointmentId).toBe(created.id);
    expect(payload.patientId).toBe(created.patientId);
    expect(payload.hospitalId).toBe(created.hospitalId);
    expect(payload.branchId).toBe(created.branchId);
    expect(payload.previousScheduledAt).toBe(originalStart);
    expect(payload.scheduledAt).toBe(rescheduledStart1);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(typeof payload.text).toBe('string');
    expect(String(payload.text)).toContain('rescheduled');
    expect(JSON.stringify(payload)).not.toMatch(/password|jwt|accessToken/i);

    const dispatchJobs = await prisma.job.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outboxes[0].id },
      },
    });
    expect(dispatchJobs).toHaveLength(1);
    createdJobIds.push(dispatchJobs[0].id);
    await holdDispatchJobUntilReady(dispatchJobs[0].id);
  });

  itWithDb('same startAt update creates no reschedule outbox', async () => {
    const ctx = await seedSchedulingContext('same-start');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      startAt: originalStart,
      notes: 'still same time',
    });

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('notes-only update creates no reschedule outbox', async () => {
    const ctx = await seedSchedulingContext('notes-only');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      notes: 'patient called',
    });

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('endAt-only change without startAt change creates no reschedule outbox', async () => {
    const ctx = await seedSchedulingContext('end-only');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      endAt: '2026-10-06T10:45:00.000Z',
    });

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('rolls back appointment update when outbox creation fails', async () => {
    const ctx = await seedSchedulingContext('rollback-outbox');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    const failingOutbox = new DomainEventOutboxService(prisma as never, jobService);
    jest
      .spyOn(failingOutbox, 'createInTransaction')
      .mockRejectedValueOnce(new Error('simulated outbox failure'));

    const failingAppointments = new AppointmentsService(
      prisma as never,
      auditService as unknown as AuditService,
      failingOutbox,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      new SchedulingPolicyService(prisma as never),
    );

    await expect(
      failingAppointments.update(hospitalUser, created.id, {
        startAt: rescheduledStart1,
        endAt: rescheduledEnd1,
      }),
    ).rejects.toThrow('simulated outbox failure');

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.startAt.toISOString()).toBe(originalStart);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('rolls back appointment update and outbox when dispatch enqueue fails', async () => {
    const ctx = await seedSchedulingContext('rollback-job');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    const brokenJobService = new JobService(prisma as never);
    jest
      .spyOn(brokenJobService, 'enqueueWithClient')
      .mockRejectedValueOnce(new Error('simulated job enqueue failure'));

    const outboxWithBrokenJobs = new DomainEventOutboxService(
      prisma as never,
      brokenJobService,
    );
    const failingAppointments = new AppointmentsService(
      prisma as never,
      auditService as unknown as AuditService,
      outboxWithBrokenJobs,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn().mockResolvedValue(undefined) } as never,
      new SchedulingPolicyService(prisma as never),
    );

    await expect(
      failingAppointments.update(hospitalUser, created.id, {
        startAt: rescheduledStart1,
        endAt: rescheduledEnd1,
      }),
    ).rejects.toThrow('simulated job enqueue failure');

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.startAt.toISOString()).toBe(originalStart);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('multiple reschedules create distinct outbox idempotency keys', async () => {
    const ctx = await seedSchedulingContext('multi');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });
    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart2,
      endAt: rescheduledEnd2,
    });

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(outboxes).toHaveLength(2);
    expect(outboxes[0].idempotencyKey).toBe(
      appointmentRescheduledIdempotencyKey(
        created.id,
        new Date(rescheduledStart1),
      ),
    );
    expect(outboxes[1].idempotencyKey).toBe(
      appointmentRescheduledIdempotencyKey(
        created.id,
        new Date(rescheduledStart2),
      ),
    );
    expect(outboxes[0].idempotencyKey).not.toBe(outboxes[1].idempotencyKey);

    const payload0 = outboxes[0].payload as Record<string, unknown>;
    const payload1 = outboxes[1].payload as Record<string, unknown>;
    expect(payload0.previousScheduledAt).toBe(originalStart);
    expect(payload0.scheduledAt).toBe(rescheduledStart1);
    expect(payload1.previousScheduledAt).toBe(rescheduledStart1);
    expect(payload1.scheduledAt).toBe(rescheduledStart2);
  });

  itWithDb('policy allows reschedule dispatch with default preference', async () => {
    const ctx = await seedSchedulingContext('pol-allow');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );
    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
    });

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outbox.id },
      },
    });
    createdJobIds.push(dispatchJob.id);
    await holdDispatchJobUntilReady(dispatchJob.id);
    await releaseDispatchJobForHandling(dispatchJob.id);
    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h6c-allow' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.category).toBe(APPOINTMENT_RESCHEDULED_CATEGORY);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );
  });

  itWithDb('policy skips reschedule when patient opted out', async () => {
    const ctx = await seedSchedulingContext('pol-skip');
    const pref = await preferenceService.upsertWhatsAppTransactionalEnabled(
      ctx.hospital.id,
      ctx.patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);

    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );
    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
    });

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outbox.id },
      },
    });
    createdJobIds.push(dispatchJob.id);
    await holdDispatchJobUntilReady(dispatchJob.id);
    await releaseDispatchJobForHandling(dispatchJob.id);
    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h6c-skip' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    );
  });

  itWithDb('runs full reschedule pipeline with whatsapp channel SKIPPED and no send jobs', async () => {
    const ctx = await seedSchedulingContext('pipeline');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );
    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
    });

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outbox.id },
      },
    });
    createdJobIds.push(dispatchJob.id);
    await holdDispatchJobUntilReady(dispatchJob.id);
    await releaseDispatchJobForHandling(dispatchJob.id);
    await dispatchHandler.handle(dispatchJob, {
      workerId: 'worker-h6c-pipeline',
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );

    const notificationPayload = notification.payload as {
      data?: { scheduledAt?: string; previousScheduledAt?: string };
    };
    expect(notificationPayload.data?.scheduledAt).toBe(rescheduledStart1);
    expect(notificationPayload.data?.previousScheduledAt).toBe(originalStart);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });

  itWithDb('stale H5 reminder is skipped after reschedule without WhatsAppMessage', async () => {
    const ctx = await seedSchedulingContext('stale-reminder');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    const reminderEvent = buildAppointmentReminder24hDomainEvent({
      id: created.id,
      hospitalId: created.hospitalId,
      branchId: created.branchId,
      patientId: created.patientId,
      startAt: new Date(originalStart),
    });
    const { reminderOutbox } = await prisma.$transaction(async (tx) => {
      const row = await outboxService.createInTransaction(tx, reminderEvent);
      await outboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: created.hospitalId,
        branchId: created.branchId,
        outboxId: row.id,
      });
      return { reminderOutbox: row };
    });
    const reminderDispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: reminderOutbox.id },
      },
    });
    createdJobIds.push(reminderDispatchJob.id);
    await holdDispatchJobUntilReady(reminderDispatchJob.id);

    const reminderPayload = reminderOutbox.payload as Record<string, unknown>;
    expect(reminderPayload.scheduledAt).toBe(originalStart);

    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart2,
      endAt: rescheduledEnd2,
    });

    const appt = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(appt.startAt.toISOString()).toBe(rescheduledStart2);

    await releaseDispatchJobForHandling(reminderDispatchJob.id);
    await dispatchHandler.handle(reminderDispatchJob, {
      workerId: 'worker-h6c-stale-reminder',
    });

    const staleNotification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: reminderOutbox.id },
    });
    expect(staleNotification.category).toBe(APPOINTMENT_REMINDER_24H_EVENT_TYPE);
    expect(staleNotification.status).toBe(NotificationStatus.SKIPPED);
    expect(staleNotification.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.APPOINTMENT_TIME_CHANGED,
    );

    const staleMessages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: staleNotification.id },
    });
    expect(staleMessages).toHaveLength(0);
  });

  itWithDb('new reschedule notification uses new schedule and is not treated as stale reminder', async () => {
    const ctx = await seedSchedulingContext('new-resched');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart2,
      endAt: rescheduledEnd2,
    });

    const rescheduleOutbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
      },
    });
    const rescheduleJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: rescheduleOutbox.id },
      },
    });
    createdJobIds.push(rescheduleJob.id);
    await holdDispatchJobUntilReady(rescheduleJob.id);
    await releaseDispatchJobForHandling(rescheduleJob.id);
    await dispatchHandler.handle(rescheduleJob, {
      workerId: 'worker-h6c-new-resched',
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: rescheduleOutbox.id },
    });
    expect(notification.category).toBe(APPOINTMENT_RESCHEDULED_CATEGORY);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );

    const data = (notification.payload as { data?: Record<string, string> })
      .data;
    expect(data?.scheduledAt).toBe(rescheduledStart2);
    expect(data?.previousScheduledAt).toBe(originalStart);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });

  itWithDb('branch-only change without startAt change does not create reschedule outbox', async () => {
    const ctx = await seedSchedulingContext('branch-only');
    const branch2 = await prisma.branch.create({
      data: {
        hospitalId: ctx.hospital.id,
        name: 'Second',
        code: `BR2-${runId}`,
      },
    });
    createdBranchIds.push(branch2.id);

    const resource2 = await prisma.resource.create({
      data: {
        hospitalId: ctx.hospital.id,
        branchId: branch2.id,
        type: ResourceType.DOCTOR,
        name: 'Dr Branch2',
        status: ResourceStatus.ACTIVE,
      },
    });
    createdResourceIds.push(resource2.id);

    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    await appointmentsService.update(hospitalUser, created.id, {
      branchId: branch2.id,
      resourceIds: [resource2.id],
    });

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('booked and cancelled producers remain unaffected by reschedule flow', async () => {
    const ctx = await seedSchedulingContext('regression');
    const created = await createAppointmentAt(
      ctx,
      originalStart,
      originalEnd,
    );

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
        },
      }),
    ).toBe(1);

    await appointmentsService.update(hospitalUser, created.id, {
      startAt: rescheduledStart1,
      endAt: rescheduledEnd1,
    });

    await appointmentsService.cancel(hospitalUser, created.id);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: 'appointment.cancelled',
        },
      }),
    ).toBe(1);
  });
});
