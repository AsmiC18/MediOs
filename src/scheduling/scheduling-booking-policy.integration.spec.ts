import {
  AppointmentStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { SchedulingPolicyService } from './scheduling-policy.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';
import {
  BOOKING_TOO_FAR_MESSAGE,
  BOOKING_TOO_SOON_MESSAGE,
  CANCELLATION_WINDOW_CLOSED_MESSAGE,
} from './scheduling-booking-policy.util';
import {
  setSchedulingNowForTests,
} from './scheduling-clock';

describe('Scheduling booking policy integration (S3)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let policy: SchedulingPolicyService;
  let appointmentsService: AppointmentsService;

  let hospitalId: string;
  let branchA: string;
  let patientId: string;
  let doctorUserId: string;
  let doctorBUserId: string;
  let doctorAResourceId: string;
  let doctorBResourceId: string;
  let roomResourceId: string;
  let bookingRuleId: string;

  const staffUser = {
    sub: 'sched-s3',
    hospitalId: '',
    branchId: null as string | null,
  };

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    policy = new SchedulingPolicyService(prisma as never);
    const jobService = new JobService(prisma as never);
    const outbox = new DomainEventOutboxService(prisma as never, jobService);
    appointmentsService = new AppointmentsService(
      prisma as never,
      { log: jest.fn() } as unknown as AuditService,
      outbox,
      { enqueueNpsTriggerIfNewlyCompleted: jest.fn() } as never,
      policy,
    );

    hospitalId = (
      await prisma.hospital.create({
        data: { name: `S3 ${runId}`, code: `S3-${runId}` },
      })
    ).id;
    staffUser.hospitalId = hospitalId;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `S3A-${runId}` },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchA,
          phone: `9${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
          firstName: 'S3',
        },
      })
    ).id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R-${runId}` },
    });
    doctorUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId: branchA,
          roleId: role.id,
          name: 'Doctor A',
          passwordHash: 'hash',
        },
      })
    ).id;
    doctorBUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId: branchA,
          roleId: role.id,
          name: 'Doctor B',
          passwordHash: 'hash',
        },
      })
    ).id;

    doctorAResourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId: branchA,
          userId: doctorUserId,
          type: ResourceType.DOCTOR,
          name: 'Dr A',
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;
    doctorBResourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId: branchA,
          userId: doctorBUserId,
          type: ResourceType.DOCTOR,
          name: 'Dr B',
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;
    roomResourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId: branchA,
          type: ResourceType.ROOM,
          name: 'Room',
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;
  });

  afterEach(() => {
    setSchedulingNowForTests(null);
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({ where: { hospitalId } });
    await prisma.domainEventOutbox.deleteMany({ where: { hospitalId } });
    await prisma.appointmentResource.deleteMany({
      where: { appointment: { hospitalId } },
    });
    await prisma.appointment.deleteMany({ where: { hospitalId } });
    await prisma.leave.deleteMany({ where: { hospitalId } });
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultBookingRuleId: null },
    });
    if (bookingRuleId) {
      await prisma.bookingRule.deleteMany({ where: { id: bookingRuleId } });
    }
    await prisma.resource.deleteMany({ where: { hospitalId } });
    await prisma.user.deleteMany({ where: { hospitalId } });
    await prisma.role.deleteMany({ where: { hospitalId } });
    await prisma.patient.deleteMany({ where: { hospitalId } });
    await prisma.branch.deleteMany({ where: { hospitalId } });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.$disconnect();
  });

  const itDb = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!dbAvailable) {
        return;
      }
      await fn();
    });
  };

  async function setPolicy(overrides: {
    minimumAdvanceMinutes?: number;
    maximumAdvanceMinutes?: number | null;
    cancellationWindowMinutes?: number;
    bufferMinutes?: number;
  }) {
    if (bookingRuleId) {
      await prisma.bookingRule.update({
        where: { id: bookingRuleId },
        data: {
          minimumAdvanceMinutes: 0,
          maximumAdvanceMinutes: null,
          cancellationWindowMinutes: 0,
          bufferMinutes: 0,
          ...overrides,
        },
      });
      return;
    }

    const rule = await prisma.bookingRule.create({
      data: {
        hospitalId,
        minDurationMinutes: 15,
        maxDurationMinutes: 120,
        slotDurationMinutes: 15,
        minimumAdvanceMinutes: overrides.minimumAdvanceMinutes ?? 0,
        maximumAdvanceMinutes: overrides.maximumAdvanceMinutes ?? null,
        cancellationWindowMinutes: overrides.cancellationWindowMinutes ?? 0,
        bufferMinutes: overrides.bufferMinutes ?? 0,
      },
    });
    bookingRuleId = rule.id;
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultBookingRuleId: rule.id },
    });
  }

  itDb('minimum advance rejects and accepts boundary on staff create', async () => {
    await setPolicy({ minimumAdvanceMinutes: 60 });
    setSchedulingNowForTests(new Date('2028-06-15T10:00:00.000Z'));

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-15T10:59:00.000Z',
        endAt: '2028-06-15T11:14:00.000Z',
      }),
    ).rejects.toMatchObject({ message: BOOKING_TOO_SOON_MESSAGE });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-15T11:00:00.000Z',
        endAt: '2028-06-15T11:15:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('maximum advance rejects beyond boundary on staff create', async () => {
    await setPolicy({ maximumAdvanceMinutes: 24 * 60 });
    setSchedulingNowForTests(new Date('2028-06-01T10:00:00.000Z'));

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-02T10:01:00.000Z',
        endAt: '2028-06-02T10:16:00.000Z',
      }),
    ).rejects.toMatchObject({ message: BOOKING_TOO_FAR_MESSAGE });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-02T10:00:00.000Z',
        endAt: '2028-06-02T10:15:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('buffer rejects adjacent slot and accepts spaced slot', async () => {
    await setPolicy({ bufferMinutes: 15 });
    setSchedulingNowForTests(new Date('2028-06-20T08:00:00.000Z'));

    await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-20T10:00:00.000Z',
      endAt: '2028-06-20T10:30:00.000Z',
    });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-20T10:30:00.000Z',
        endAt: '2028-06-20T10:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-20T10:45:00.000Z',
        endAt: '2028-06-20T11:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('multi-resource buffer conflict rejects when any resource violates buffer', async () => {
    await setPolicy({ bufferMinutes: 15 });
    setSchedulingNowForTests(new Date('2028-06-21T08:00:00.000Z'));

    await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorBResourceId],
      startAt: '2028-06-21T10:00:00.000Z',
      endAt: '2028-06-21T10:30:00.000Z',
    });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId, doctorBResourceId],
        startAt: '2028-06-21T10:30:00.000Z',
        endAt: '2028-06-21T10:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('portal slots exclude minimum advance and buffer', async () => {
    await setPolicy({ minimumAdvanceMinutes: 60, bufferMinutes: 15 });
    setSchedulingNowForTests(new Date('2028-06-22T10:00:00.000Z'));

    await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-22T14:00:00.000Z',
      endAt: '2028-06-22T14:30:00.000Z',
    });

    const generated = await policy.generatePortalAvailableSlots({
      hospitalId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      date: '2028-06-22',
      slotDurationMinutes: 15,
      durationMinutes: 15,
    });

    const starts = generated.slots.map((s) => s.startAt);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts).not.toContain('2028-06-22T10:30:00.000Z');
    expect(starts).not.toContain('2028-06-22T14:30:00.000Z');
    expect(starts).toContain('2028-06-22T11:00:00.000Z');
    expect(starts).toContain('2028-06-22T14:45:00.000Z');
  });

  itDb('cancellation window enforced for staff cancel', async () => {
    await setPolicy({ cancellationWindowMinutes: 120 });
    setSchedulingNowForTests(new Date('2028-06-23T12:59:00.000Z'));

    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-23T15:00:00.000Z',
      endAt: '2028-06-23T15:15:00.000Z',
    });

    await expect(
      appointmentsService.cancel(staffUser, appt.id),
    ).resolves.toBeDefined();

    const appt2 = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-23T14:00:00.000Z',
      endAt: '2028-06-23T14:15:00.000Z',
    });

    setSchedulingNowForTests(new Date('2028-06-23T13:01:00.000Z'));
    await expect(
      appointmentsService.cancel(staffUser, appt2.id),
    ).rejects.toMatchObject({ message: CANCELLATION_WINDOW_CLOSED_MESSAGE });
  });

  itDb('portal cancel uses same cancellation window', async () => {
    await setPolicy({ cancellationWindowMinutes: 120 });
    setSchedulingNowForTests(new Date('2028-06-24T08:00:00.000Z'));

    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-24T15:00:00.000Z',
      endAt: '2028-06-24T15:15:00.000Z',
    });

    setSchedulingNowForTests(new Date('2028-06-24T13:30:00.000Z'));
    await expect(
      appointmentsService.cancelForPortalPatient(
        { patientId, hospitalId },
        appt.id,
      ),
    ).rejects.toMatchObject({ message: CANCELLATION_WINDOW_CLOSED_MESSAGE });
  });

  itDb('reschedule re-evaluates advance and buffer', async () => {
    await setPolicy({ minimumAdvanceMinutes: 30, bufferMinutes: 15 });
    setSchedulingNowForTests(new Date('2028-06-25T10:00:00.000Z'));

    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-25T12:00:00.000Z',
      endAt: '2028-06-25T12:15:00.000Z',
    });

    await expect(
      appointmentsService.update(staffUser, appt.id, {
        startAt: '2028-06-25T10:20:00.000Z',
        endAt: '2028-06-25T10:35:00.000Z',
      }),
    ).rejects.toMatchObject({ message: BOOKING_TOO_SOON_MESSAGE });

    await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-25T14:00:00.000Z',
      endAt: '2028-06-25T14:30:00.000Z',
    });

    await expect(
      appointmentsService.update(staffUser, appt.id, {
        startAt: '2028-06-25T14:30:00.000Z',
        endAt: '2028-06-25T14:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('repeated cancellation of cancelled appointment stays safe', async () => {
    await setPolicy({ cancellationWindowMinutes: 120 });
    setSchedulingNowForTests(new Date('2028-06-26T08:00:00.000Z'));

    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-26T15:00:00.000Z',
      endAt: '2028-06-26T15:15:00.000Z',
    });

    await appointmentsService.cancel(staffUser, appt.id);

    setSchedulingNowForTests(new Date('2028-06-26T13:30:00.000Z'));
    await expect(
      appointmentsService.cancel(staffUser, appt.id),
    ).resolves.toMatchObject({ status: AppointmentStatus.CANCELLED });
  });
});
