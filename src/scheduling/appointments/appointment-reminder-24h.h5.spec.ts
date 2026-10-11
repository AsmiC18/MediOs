import {
  AppointmentStatus,
  DomainEventOutboxStatus,
  NotificationStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { AppointmentReminderSchedulerTask } from '../../jobs/scheduler/appointment-reminder-scheduler.task';
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
  APPOINTMENT_REMINDER_24H_EVENT_TYPE,
  appointmentReminder24hIdempotencyKey,
} from './appointment-reminder-24h-event.util';
import {
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
  findAppointmentCandidatesForReminder24h,
  tryScheduleAppointmentReminder24h,
} from './appointment-reminder-24h-scheduler.util';

describe('Appointment reminder 24h H5', () => {
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
  const dispatchHandler = instantiateNotificationDispatchJobHandler({
    prisma,
    outboxService,
    notificationService,
    policyService,
  });
  const schedulerTask = new AppointmentReminderSchedulerTask(outboxService);

  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdHospitalIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdResourceIds: string[] = [];
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
        where: { appointment: { hospitalId: { in: createdHospitalIds } } },
      });
      await prisma.appointment.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.whatsAppConfig.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
    }
    if (createdResourceIds.length > 0) {
      await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
    }
    if (createdPatientIds.length > 0) {
      await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdBranchIds.length > 0) {
      await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
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

  async function seedHospital(suffix: string) {
    const hospital = await prisma.hospital.create({
      data: { name: `H5 ${suffix}`, code: `H5-${runId}-${suffix}` },
    });
    createdHospitalIds.push(hospital.id);
    const branch = await prisma.branch.create({
      data: {
        hospitalId: hospital.id,
        name: 'Branch',
        code: `H5B-${runId}-${suffix}`,
      },
    });
    createdBranchIds.push(branch.id);
    const patient = await prisma.patient.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        phone: `9${runId.replace(/\D/g, '').slice(0, 9)}${suffix}`.slice(0, 15),
        firstName: 'H5',
      },
    });
    createdPatientIds.push(patient.id);
    const resource = await prisma.resource.create({
      data: {
        hospitalId: hospital.id,
        branchId: branch.id,
        type: ResourceType.DOCTOR,
        name: 'Dr H5',
        status: ResourceStatus.ACTIVE,
      },
    });
    createdResourceIds.push(resource.id);
    return { hospital, branch, patient, resource };
  }

  async function createAppointment(input: {
    hospitalId: string;
    branchId: string;
    patientId: string;
    startAt: Date;
    status?: AppointmentStatus;
  }) {
    const endAt = new Date(input.startAt.getTime() + 30 * 60 * 1000);
    const appointment = await prisma.appointment.create({
      data: {
        hospitalId: input.hospitalId,
        branchId: input.branchId,
        patientId: input.patientId,
        startAt: input.startAt,
        endAt,
        status: input.status ?? AppointmentStatus.SCHEDULED,
      },
    });
    createdAppointmentIds.push(appointment.id);
    return appointment;
  }

  function tickForStartAt(startAt: Date): Date {
    return new Date(startAt.getTime() - APPOINTMENT_REMINDER_24H_OFFSET_MS);
  }

  async function runSchedulerTick(tickAt: Date) {
    await prisma.$transaction(async (transaction) => {
      const context = {
        windowKey: 'test',
        tickAt,
        transaction,
        jobService,
      };
      await schedulerTask.run(context);
    });
  }

  itWithDb('creates one reminder outbox and dispatch job for eligible appointment', async () => {
    const ctx = await seedHospital('eligible');
    const startAt = new Date('2026-12-20T14:00:00.000Z');
    const appointment = await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    await runSchedulerTick(tickForStartAt(startAt));

    const outboxes = await prisma.domainEventOutbox.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
      },
    });
    expect(outboxes).toHaveLength(1);
    expect(outboxes[0].entityId).toBe(appointment.id);
    expect(outboxes[0].branchId).toBe(ctx.branch.id);
    expect(outboxes[0].idempotencyKey).toBe(
      appointmentReminder24hIdempotencyKey(appointment.id),
    );

    const payload = outboxes[0].payload as Record<string, unknown>;
    expect(payload.patientId).toBe(ctx.patient.id);
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(JSON.stringify(payload)).not.toMatch(/password|jwt|accessToken/i);

    const jobs = await prisma.job.findMany({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({ outboxId: outboxes[0].id });
    expect(jobs[0].branchId).toBe(ctx.branch.id);
    createdJobIds.push(jobs[0].id);
  });

  itWithDb('does not select appointment outside 24h window (too early)', async () => {
    const ctx = await seedHospital('early');
    const startAt = new Date('2026-12-25T10:00:00.000Z');
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    const tickTooEarly = new Date('2026-12-23T10:00:00.000Z');
    await runSchedulerTick(tickTooEarly);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('does not select appointment outside window (too late)', async () => {
    const ctx = await seedHospital('late');
    const startAt = new Date('2026-12-25T10:00:00.000Z');
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    const tickTooLate = new Date('2026-12-24T10:01:00.000Z');
    await runSchedulerTick(tickTooLate);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
        },
      }),
    ).toBe(0);
  });

  itWithDb('skips cancelled and completed appointments', async () => {
    const ctx = await seedHospital('terminal');
    const startAt = new Date('2026-12-21T08:00:00.000Z');
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
      status: AppointmentStatus.CANCELLED,
    });
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt: new Date(startAt.getTime() + 60_000),
      status: AppointmentStatus.COMPLETED,
    });

    await runSchedulerTick(tickForStartAt(startAt));

    expect(
      await prisma.domainEventOutbox.count({
        where: { hospitalId: ctx.hospital.id },
      }),
    ).toBe(0);
  });

  itWithDb('idempotent scheduler runs create one outbox and one job', async () => {
    const ctx = await seedHospital('idem');
    const startAt = new Date('2026-12-22T11:30:00.000Z');
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    const tickAt = tickForStartAt(startAt);
    await runSchedulerTick(tickAt);
    await runSchedulerTick(tickAt);

    expect(
      await prisma.domainEventOutbox.count({
        where: {
          hospitalId: ctx.hospital.id,
          eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.job.count({
        where: {
          hospitalId: ctx.hospital.id,
          type: JOB_TYPES.NOTIFICATION_DISPATCH,
        },
      }),
    ).toBe(1);
  });

  itWithDb('does not leave orphan outbox when dispatch job enqueue fails', async () => {
    const ctx = await seedHospital('atomic');
    const startAt = new Date('2026-12-23T09:15:00.000Z');
    const appointment = await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    const brokenOutboxService = new DomainEventOutboxService(
      prisma as never,
      jobService,
    );
    jest
      .spyOn(brokenOutboxService, 'enqueueDispatchInTransaction')
      .mockRejectedValueOnce(new Error('simulated enqueue failure'));

    await expect(
      prisma.$transaction(async (transaction) => {
        await tryScheduleAppointmentReminder24h(
          {
            windowKey: 'test',
            tickAt: tickForStartAt(startAt),
            transaction,
            jobService,
          },
          brokenOutboxService,
          appointment.id,
        );
      }),
    ).rejects.toThrow('simulated enqueue failure');

    expect(
      await prisma.domainEventOutbox.count({
        where: { hospitalId: ctx.hospital.id },
      }),
    ).toBe(0);
    jest.restoreAllMocks();
  });

  itWithDb('skips reminder when appointment cancelled before schedule transaction', async () => {
    const ctx = await seedHospital('race');
    const startAt = new Date('2026-12-24T16:00:00.000Z');
    const appointment = await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.CANCELLED },
    });

    await prisma.$transaction(async (transaction) => {
      const candidates = await findAppointmentCandidatesForReminder24h(
        transaction,
        tickForStartAt(startAt),
      );
      expect(candidates.some((c) => c.id === appointment.id)).toBe(false);

      const outcome = await tryScheduleAppointmentReminder24h(
        {
          windowKey: 'test',
          tickAt: tickForStartAt(startAt),
          transaction,
          jobService,
        },
        outboxService,
        appointment.id,
      );
      expect(outcome).toBe('skipped');
    });

    expect(
      await prisma.domainEventOutbox.count({
        where: { hospitalId: ctx.hospital.id },
      }),
    ).toBe(0);
  });

  itWithDb('failure on one appointment does not block another', async () => {
    const ctxA = await seedHospital('iso-a');
    const ctxB = await seedHospital('iso-b');
    const startAt = new Date('2026-12-26T12:00:00.000Z');
    const apptA = await createAppointment({
      hospitalId: ctxA.hospital.id,
      branchId: ctxA.branch.id,
      patientId: ctxA.patient.id,
      startAt,
    });
    const apptB = await createAppointment({
      hospitalId: ctxB.hospital.id,
      branchId: ctxB.branch.id,
      patientId: ctxB.patient.id,
      startAt,
    });

    const failingOutbox = new DomainEventOutboxService(prisma as never, jobService);
    jest
      .spyOn(failingOutbox, 'createInTransaction')
      .mockImplementation(async (client, event) => {
        if (event.entityId === apptA.id) {
          throw new Error('simulated first appointment failure');
        }
        return outboxService.createInTransaction(client, event);
      });

    const failingTask = new AppointmentReminderSchedulerTask(failingOutbox);
    const tickAt = tickForStartAt(startAt);

    await prisma.$transaction(async (transaction) => {
      await failingTask.run({
        windowKey: 'test',
        tickAt,
        transaction,
        jobService,
      });
    });

    expect(
      await prisma.domainEventOutbox.findFirst({
        where: { entityId: apptA.id, hospitalId: ctxA.hospital.id },
      }),
    ).toBeNull();
    expect(
      await prisma.domainEventOutbox.findFirst({
        where: { entityId: apptB.id, hospitalId: ctxB.hospital.id },
      }),
    ).not.toBeNull();

    jest.restoreAllMocks();
  });

  itWithDb('full pipeline marks whatsapp channel SKIPPED without legacy send jobs', async () => {
    const ctx = await seedHospital('pipe');

    const startAt = new Date('2026-12-27T07:00:00.000Z');
    await createAppointment({
      hospitalId: ctx.hospital.id,
      branchId: ctx.branch.id,
      patientId: ctx.patient.id,
      startAt,
    });

    await runSchedulerTick(tickForStartAt(startAt));

    const outbox = await prisma.domainEventOutbox.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
      },
    });
    expect(outbox.status).toBe(DomainEventOutboxStatus.PENDING);

    const dispatchJob = await prisma.job.findFirstOrThrow({
      where: {
        hospitalId: ctx.hospital.id,
        type: JOB_TYPES.NOTIFICATION_DISPATCH,
      },
    });
    createdJobIds.push(dispatchJob.id);

    await dispatchHandler.handle(dispatchJob, { workerId: 'worker-h5' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { hospitalId: ctx.hospital.id, outboxId: outbox.id },
    });
    expect(notification.channel).toBe(NOTIFICATION_CHANNEL_WHATSAPP);
    expect(notification.status).toBe(NotificationStatus.SKIPPED);
    expect(notification.lastError).toBe(
      NOTIFICATION_WHATSAPP_SKIP_REASON_CHANNEL_NOT_CONFIGURED,
    );

    const messages = await prisma.whatsAppMessage.findMany({
      where: { sourceNotificationId: notification.id },
    });
    expect(messages).toHaveLength(0);
  });
});
