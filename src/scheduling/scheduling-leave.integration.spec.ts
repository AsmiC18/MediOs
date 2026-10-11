import { ConflictException } from '@nestjs/common';
import {
  LeaveStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { SchedulingPolicyService } from './scheduling-policy.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';
describe('Scheduling leave integration (S2B)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let policy: SchedulingPolicyService;
  let appointmentsService: AppointmentsService;

  let hospitalId: string;
  let branchA: string;
  let branchB: string;
  let patientId: string;
  let doctorAUserId: string;
  let doctorBUserId: string;
  let doctorAResourceId: string;
  let doctorBResourceId: string;
  let roomResourceId: string;

  const staffUser = {
    sub: 'sched-s2b',
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
        data: { name: `S2B ${runId}`, code: `S2B-${runId}` },
      })
    ).id;
    staffUser.hospitalId = hospitalId;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `S2BA-${runId}` },
      })
    ).id;
    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `S2BB-${runId}` },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchA,
          phone: `8${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
          firstName: 'S2B',
        },
      })
    ).id;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R-${runId}` },
    });
    doctorAUserId = (
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
          userId: doctorAUserId,
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

    const ws = await prisma.workSchedule.create({
      data: {
        hospitalId,
        workStartTime: '09:00',
        workEndTime: '17:00',
        timezone: 'Asia/Kolkata',
      },
    });
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultWorkScheduleId: ws.id },
    });
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
    await prisma.rosterEntry.deleteMany({ where: { hospitalId } });
    await prisma.resource.deleteMany({ where: { hospitalId } });
    await prisma.user.deleteMany({ where: { hospitalId } });
    await prisma.role.deleteMany({ where: { hospitalId } });
    await prisma.patient.deleteMany({ where: { hospitalId } });
    await prisma.branch.updateMany({
      where: { hospitalId },
      data: { workScheduleId: null },
    });
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultWorkScheduleId: null },
    });
    await prisma.workSchedule.deleteMany({ where: { hospitalId } });
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

  async function createLeave(input: {
    userId: string;
    startAt: string;
    endAt: string;
    branchId?: string | null;
  }) {
    return prisma.leave.create({
      data: {
        hospitalId,
        userId: input.userId,
        branchId: input.branchId ?? null,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        status: LeaveStatus.ACTIVE,
      },
    });
  }

  itDb('booking outside leave succeeds', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-01T08:30:00.000Z',
      endAt: '2028-06-01T09:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-01T04:30:00.000Z',
        endAt: '2028-06-01T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('booking fully inside leave fails', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-02T04:00:00.000Z',
      endAt: '2028-06-02T06:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-02T04:30:00.000Z',
        endAt: '2028-06-02T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('booking starting during leave fails', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-03T04:45:00.000Z',
      endAt: '2028-06-03T06:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-03T04:30:00.000Z',
        endAt: '2028-06-03T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('booking ending during leave fails', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-04T04:00:00.000Z',
      endAt: '2028-06-04T04:45:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-04T04:30:00.000Z',
        endAt: '2028-06-04T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('booking exactly at leave end succeeds', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-05T04:00:00.000Z',
      endAt: '2028-06-05T04:30:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-05T04:30:00.000Z',
        endAt: '2028-06-05T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('booking immediately before leave starts succeeds', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-06T05:00:00.000Z',
      endAt: '2028-06-06T06:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-06T04:30:00.000Z',
        endAt: '2028-06-06T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('multi-provider appointment rejected if any provider on leave', async () => {
    await createLeave({
      userId: doctorBUserId,
      startAt: '2028-06-07T04:30:00.000Z',
      endAt: '2028-06-07T05:30:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId, doctorBResourceId],
        startAt: '2028-06-07T04:30:00.000Z',
        endAt: '2028-06-07T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('non-provider resource does not trigger leave validation', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-08T04:00:00.000Z',
      endAt: '2028-06-08T06:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [roomResourceId],
        startAt: '2028-06-08T04:30:00.000Z',
        endAt: '2028-06-08T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('reschedule into leave fails', async () => {
    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-09T04:30:00.000Z',
      endAt: '2028-06-09T05:00:00.000Z',
    });
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-09T06:00:00.000Z',
      endAt: '2028-06-09T07:00:00.000Z',
    });
    await expect(
      appointmentsService.update(staffUser, appt.id, {
        startAt: '2028-06-09T06:15:00.000Z',
        endAt: '2028-06-09T06:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('reschedule out of leave succeeds when other rules pass', async () => {
    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      startAt: '2028-06-10T05:30:00.000Z',
      endAt: '2028-06-10T06:00:00.000Z',
    });
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-10T04:00:00.000Z',
      endAt: '2028-06-10T05:00:00.000Z',
    });
    await expect(
      appointmentsService.update(staffUser, appt.id, {
        startAt: '2028-06-10T06:00:00.000Z',
        endAt: '2028-06-10T06:30:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('portal slots exclude leave intervals', async () => {
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-11T08:30:00.000Z',
      endAt: '2028-06-11T10:30:00.000Z',
    });
    const result = await policy.generatePortalAvailableSlots({
      hospitalId,
      branchId: branchA,
      resourceIds: [doctorAResourceId],
      date: '2028-06-11',
      slotDurationMinutes: 30,
      durationMinutes: 30,
    });
    const starts = result.slots.map((s) => s.startAt);
    expect(starts).toContain('2028-06-11T03:30:00.000Z');
    expect(starts).not.toContain('2028-06-11T08:30:00.000Z');
    expect(starts).not.toContain('2028-06-11T09:00:00.000Z');
    expect(starts).toContain('2028-06-11T10:30:00.000Z');
  });

  itDb('branch-specific leave does not block other branch booking', async () => {
    await createLeave({
      userId: doctorAUserId,
      branchId: branchB,
      startAt: '2028-06-12T04:00:00.000Z',
      endAt: '2028-06-12T06:00:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-12T04:30:00.000Z',
        endAt: '2028-06-12T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('work schedule, roster, and leave enforced together', async () => {
    await prisma.rosterEntry.create({
      data: {
        hospitalId,
        branchId: branchA,
        userId: doctorAUserId,
        date: new Date(Date.UTC(2028, 5, 13)),
        shiftStartTime: '09:00',
        shiftEndTime: '17:00',
      },
    });
    await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-13T07:30:00.000Z',
      endAt: '2028-06-13T09:30:00.000Z',
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-13T08:00:00.000Z',
        endAt: '2028-06-13T08:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-13T09:30:00.000Z',
        endAt: '2028-06-13T10:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('cancelled leave does not block booking', async () => {
    const leave = await createLeave({
      userId: doctorAUserId,
      startAt: '2028-06-14T04:00:00.000Z',
      endAt: '2028-06-14T06:00:00.000Z',
    });
    await prisma.leave.update({
      where: { id: leave.id },
      data: { status: LeaveStatus.CANCELLED },
    });
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorAResourceId],
        startAt: '2028-06-14T04:30:00.000Z',
        endAt: '2028-06-14T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });
});
