import {
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
import { PatientNotificationPreferenceService } from '../../notifications/patient-notification-preference.service';
import {
  APPOINTMENT_BOOKED_EVENT_TYPE,
  APPOINTMENT_ENTITY_TYPE,
  appointmentBookedIdempotencyKey,
} from './appointment-booked-event.util';
import { AppointmentsService } from './appointments.service';
import { SchedulingPolicyService } from '../scheduling-policy.service';

describe('Appointment booked H4 producer', () => {
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

  const hospitalUser = {
    sub: 'user-h4',
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
        name: `H4 ${suffix}`,
        code: `H4-${runId}-${suffix}`,
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
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H4',
      },
    });
    createdPatientIds.push(patient.id);

    const resource = await prisma.resource.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        type: ResourceType.DOCTOR,
        name: `Dr H4 ${suffix}`,
        status: ResourceStatus.ACTIVE,
      },
    });
    createdResourceIds.push(resource.id);

    const config = await prisma.whatsAppConfig.create({
      data: {
        hospitalId: hospital.id,
        phoneNumberId: `phone-h4-${runId}-${suffix}`,
        accessToken: 'test-token-h4',
        enabled: true,
      },
    });
    createdConfigIds.push(config.id);

    return { hospital, branch, patient, resource };
  }

  const startAt = '2026-12-15T09:00:00.000Z';
  const endAt = '2026-12-15T09:30:00.000Z';

  async function createAppointmentViaService(
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

  itWithDb('creates appointment.booked outbox and notification.dispatch job', async () => {
    const ctx = await seedSchedulingContext('prod');
    const appointment = await createAppointmentViaService(ctx);

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);
    expect(outboxes[0].entityType).toBe(APPOINTMENT_ENTITY_TYPE);
    expect(outboxes[0].entityId).toBe(appointment.id);
    expect(outboxes[0].hospitalId).toBe(appointment.hospitalId);
    expect(outboxes[0].branchId).toBe(appointment.branchId);
    expect(outboxes[0].idempotencyKey).toBe(
      appointmentBookedIdempotencyKey(appointment.id),
    );

    const payload = outboxes[0].payload as Record<string, unknown>;
    expect(payload.appointmentId).toBe(appointment.id);
    expect(payload.patientId).toBe(appointment.patientId);
    expect(payload.hospitalId).toBe(appointment.hospitalId);
    expect(payload.branchId).toBe(appointment.branchId);
    expect(payload.scheduledAt).toBe(startAt);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(typeof payload.text).toBe('string');
    expect(JSON.stringify(payload)).not.toMatch(/password|jwt|accessToken/i);

    const dispatchJobs = await prisma.job.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
      },
    });
    expect(dispatchJobs).toHaveLength(1);
    expect(dispatchJobs[0].payload).toEqual({ outboxId: outboxes[0].id });
    expect(dispatchJobs[0].branchId).toBe(appointment.branchId);
    createdJobIds.push(dispatchJobs[0].id);
  });

  itWithDb('rolls back appointment when outbox creation fails', async () => {
    const ctx = await seedSchedulingContext('rollback-outbox');
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
      failingAppointments.create(hospitalUser, {
        patientId: ctx.patient.id,
        branchId: ctx.branch.id,
        resourceIds: [ctx.resource.id],
        startAt: '2026-12-16T09:00:00.000Z',
        endAt: '2026-12-16T09:30:00.000Z',
      }),
    ).rejects.toThrow('simulated outbox failure');

    const apptCount = await prisma.appointment.count({
      where: { hospitalId: ctx.hospital.id },
    });
    const outboxCount = await prisma.domainEventOutbox.count({
      where: { hospitalId: ctx.hospital.id },
    });
    expect(apptCount).toBe(0);
    expect(outboxCount).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('rolls back appointment and outbox when dispatch job enqueue fails', async () => {
    const ctx = await seedSchedulingContext('rollback-job');
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
      failingAppointments.create(hospitalUser, {
        patientId: ctx.patient.id,
        branchId: ctx.branch.id,
        resourceIds: [ctx.resource.id],
        startAt: '2026-12-17T09:00:00.000Z',
        endAt: '2026-12-17T09:30:00.000Z',
      }),
    ).rejects.toThrow('simulated job enqueue failure');

    expect(
      await prisma.appointment.count({ where: { hospitalId: ctx.hospital.id } }),
    ).toBe(0);
    expect(
      await prisma.domainEventOutbox.count({
        where: { hospitalId: ctx.hospital.id },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('enforces unique outbox idempotency per appointment', async () => {
    const ctx = await seedSchedulingContext('idem');
    const appointment = await createAppointmentViaService(ctx);

    await expect(
      prisma.domainEventOutbox.create({
        data: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
          entityType: APPOINTMENT_ENTITY_TYPE,
          entityId: appointment.id,
          idempotencyKey: appointmentBookedIdempotencyKey(appointment.id),
          payload: {},
          status: DomainEventOutboxStatus.PENDING,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itWithDb('runs full pipeline dispatch without WhatsApp handoff (Phase A)', async () => {
    const ctx = await seedSchedulingContext('pipeline');
    const appointment = await createAppointmentViaService(ctx);

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
      },
    });
    createdJobIds.push(dispatchJob.id);

    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h4-pipeline' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: { not: null } },
    });
    expect(notification.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(notification.patientId).toBe(appointment.patientId);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );

    const notificationPayload = notification.payload as {
      data?: { text?: string; channel?: string };
    };
    expect(notificationPayload.data?.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(typeof notificationPayload.data?.text).toBe('string');

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
    const sendJobs = await prisma.job.count({
      where: {
        hospitalId: ctx.hospital.id,
        type: 'whatsapp.message.send',
      },
    });
    expect(sendJobs).toBe(0);
  });
});
