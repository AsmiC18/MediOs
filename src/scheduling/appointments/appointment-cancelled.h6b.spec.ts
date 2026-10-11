import {
  AppointmentStatus,
  DomainEventOutboxStatus,
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
  APPOINTMENT_CANCELLED_CATEGORY,
} from '../../notifications/notification-policy.constants';
import { PatientNotificationPreferenceService } from '../../notifications/patient-notification-preference.service';
import {
  APPOINTMENT_ENTITY_TYPE,
  APPOINTMENT_BOOKED_EVENT_TYPE,
} from './appointment-booked-event.util';
import {
  APPOINTMENT_CANCELLED_EVENT_TYPE,
  appointmentCancelledIdempotencyKey,
} from './appointment-cancelled-event.util';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';

describe('Appointment cancelled H6-B producer', () => {
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
    sub: 'user-h6b',
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
    if (createdHospitalIds.length > 0) {
      await prisma.job.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.patientNotificationPreference.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.whatsAppMessage.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.whatsAppConversation.deleteMany({
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
      await prisma.whatsAppConfig.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      if (createdResourceIds.length > 0) {
        await prisma.resource.deleteMany({
          where: { id: { in: createdResourceIds } },
        });
      }
      if (createdPatientIds.length > 0) {
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
      await prisma.hospital.deleteMany({
        where: { id: { in: createdHospitalIds } },
      });
    }
    await prisma.$disconnect();
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
        name: `H6B ${suffix}`,
        code: `H6B-${runId}-${suffix}`,
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
        phone: `8${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H6B',
      },
    });
    createdPatientIds.push(patient.id);

    const resource = await prisma.resource.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        type: ResourceType.DOCTOR,
        name: `Dr H6B ${suffix}`,
        status: ResourceStatus.ACTIVE,
      },
    });
    createdResourceIds.push(resource.id);

    const config = await prisma.whatsAppConfig.create({
      data: {
        hospitalId: hospital.id,
        phoneNumberId: `phone-h6b-${runId}-${suffix}`,
        accessToken: 'test-token-h6b',
        enabled: true,
      },
    });
    createdConfigIds.push(config.id);

    return { hospital, branch, patient, resource };
  }

  const startAt = '2026-12-20T09:00:00.000Z';
  const endAt = '2026-12-20T09:30:00.000Z';

  async function createScheduledAppointment(
    ctx: Awaited<ReturnType<typeof seedSchedulingContext>>,
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

  itWithDb('cancels SCHEDULED appointment and creates outbox + dispatch job', async () => {
    const ctx = await seedSchedulingContext('prod');
    const created = await createScheduledAppointment(ctx);

    const cancelled = await appointmentsService.cancel(
      hospitalUser,
      created.id,
    );
    expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);
    expect(outboxes[0].entityType).toBe(APPOINTMENT_ENTITY_TYPE);
    expect(outboxes[0].entityId).toBe(created.id);
    expect(outboxes[0].hospitalId).toBe(created.hospitalId);
    expect(outboxes[0].branchId).toBe(created.branchId);
    expect(outboxes[0].idempotencyKey).toBe(
      appointmentCancelledIdempotencyKey(created.id),
    );

    const payload = outboxes[0].payload as Record<string, unknown>;
    expect(payload.appointmentId).toBe(created.id);
    expect(payload.patientId).toBe(created.patientId);
    expect(payload.hospitalId).toBe(created.hospitalId);
    expect(payload.branchId).toBe(created.branchId);
    expect(payload.scheduledAt).toBe(startAt);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(typeof payload.text).toBe('string');
    expect(String(payload.text)).toContain('cancelled');
    expect(JSON.stringify(payload)).not.toMatch(/password|jwt|accessToken/i);

    const dispatchJobs = await prisma.job.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        payload: { path: ['outboxId'], equals: outboxes[0].id },
      },
    });
    expect(dispatchJobs).toHaveLength(1);
    expect(dispatchJobs[0].branchId).toBe(created.branchId);
    createdJobIds.push(dispatchJobs[0].id);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPOINTMENT_CANCELLED' }),
    );
  });

  itWithDb('rolls back cancellation when outbox creation fails', async () => {
    const ctx = await seedSchedulingContext('rollback-outbox');
    const created = await createScheduledAppointment(ctx);

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
      failingAppointments.cancel(hospitalUser, created.id),
    ).rejects.toThrow('simulated outbox failure');

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe(AppointmentStatus.SCHEDULED);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('rolls back cancellation and outbox when dispatch job enqueue fails', async () => {
    const ctx = await seedSchedulingContext('rollback-job');
    const created = await createScheduledAppointment(ctx);

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
      failingAppointments.cancel(hospitalUser, created.id),
    ).rejects.toThrow('simulated job enqueue failure');

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe(AppointmentStatus.SCHEDULED);
    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
        },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('repeated cancel succeeds without duplicate cancellation outbox', async () => {
    const ctx = await seedSchedulingContext('idem');
    const created = await createScheduledAppointment(ctx);

    await appointmentsService.cancel(hospitalUser, created.id);
    await appointmentsService.cancel(hospitalUser, created.id);

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);

    const cancelDispatchJobs = await prisma.job.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
        idempotencyKey: `notification.dispatch:${outboxes[0].id}`,
      },
    });
    expect(cancelDispatchJobs).toHaveLength(1);
  });

  itWithDb('concurrent cancel produces at most one cancellation outbox', async () => {
    const ctx = await seedSchedulingContext('race');
    const created = await createScheduledAppointment(ctx);

    await Promise.all([
      appointmentsService.cancel(hospitalUser, created.id),
      appointmentsService.cancel(hospitalUser, created.id),
    ]);

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe(AppointmentStatus.CANCELLED);
  });

  itWithDb('enforces unique outbox idempotency per cancelled appointment', async () => {
    const ctx = await seedSchedulingContext('unique');
    const created = await createScheduledAppointment(ctx);
    await appointmentsService.cancel(hospitalUser, created.id);

    await expect(
      prisma.domainEventOutbox.create({
        data: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
          entityType: APPOINTMENT_ENTITY_TYPE,
          entityId: created.id,
          idempotencyKey: appointmentCancelledIdempotencyKey(created.id),
          payload: {},
          status: DomainEventOutboxStatus.PENDING,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itWithDb('policy allows cancellation dispatch when patient has default preference', async () => {
    const ctx = await seedSchedulingContext('pol-allow');
    const created = await createScheduledAppointment(ctx);
    await appointmentsService.cancel(hospitalUser, created.id);

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
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

    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h6b-allow' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.category).toBe(APPOINTMENT_CANCELLED_CATEGORY);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );
  });

  itWithDb('policy skips cancellation when patient opted out of WhatsApp transactional', async () => {
    const ctx = await seedSchedulingContext('pol-skip');
    const pref = await preferenceService.upsertWhatsAppTransactionalEnabled(
      ctx.hospital.id,
      ctx.patient.id,
      false,
    );
    createdPreferenceIds.push(pref.id);

    const created = await createScheduledAppointment(ctx);
    await appointmentsService.cancel(hospitalUser, created.id);

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
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

    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h6b-skip' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_POLICY_SKIP_REASON.PATIENT_WHATSAPP_OPTED_OUT,
    );

    const messages = await prisma.whatsAppMessage.findMany({
      where: { hospitalId: ctx.hospital.id, sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });

  itWithDb('runs full cancel pipeline with whatsapp channel SKIPPED and no send jobs', async () => {
    const ctx = await seedSchedulingContext('pipeline');
    const created = await createScheduledAppointment(ctx);
    await appointmentsService.cancel(hospitalUser, created.id);

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
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

    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h6b-pipeline' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(notification.patientId).toBe(created.patientId);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });

  itWithDb('does not create cancelled outbox when create already emitted booked only', async () => {
    const ctx = await seedSchedulingContext('booked-only');
    const created = await createScheduledAppointment(ctx);

    const bookedOutboxes = await prisma.domainEventOutbox.count({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
      },
    });
    expect(bookedOutboxes).toBe(1);

    await appointmentsService.cancel(hospitalUser, created.id);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
        },
      }),
    ).toBe(1);
  });
});
