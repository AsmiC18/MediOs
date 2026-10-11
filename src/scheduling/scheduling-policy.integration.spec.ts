import {
  AppointmentStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { SchedulingPolicyService } from './scheduling-policy.service';
import { AppointmentsService } from './appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JobService } from '../jobs/job.service';

describe('Scheduling policy integration (S2A)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let policy: SchedulingPolicyService;
  let appointmentsService: AppointmentsService;

  let hospitalId: string;
  let otherHospitalId: string;
  let branchA: string;
  let branchB: string;
  let patientId: string;
  let doctorUserId: string;
  let doctorResourceId: string;
  let roomResourceId: string;

  const staffUser = {
    sub: 'sched-s2a',
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
        data: { name: `S2A ${runId}`, code: `S2A-${runId}` },
      })
    ).id;
    staffUser.hospitalId = hospitalId;

    otherHospitalId = (
      await prisma.hospital.create({
        data: { name: `S2A Other ${runId}`, code: `S2AO-${runId}` },
      })
    ).id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `S2AA-${runId}` },
      })
    ).id;
    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `S2AB-${runId}` },
      })
    ).id;

    patientId = (
      await prisma.patient.create({
        data: {
          hospitalId,
          branchId: branchA,
          phone: `6${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
          firstName: 'S2A',
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
          name: 'Doctor',
          passwordHash: 'hash',
        },
      })
    ).id;

    doctorResourceId = (
      await prisma.resource.create({
        data: {
          hospitalId,
          branchId: branchA,
          userId: doctorUserId,
          type: ResourceType.DOCTOR,
          name: 'Dr S2A',
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
          name: 'Room 1',
          status: ResourceStatus.ACTIVE,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.job.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.domainEventOutbox.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.appointmentResource.deleteMany({
      where: { appointment: { hospitalId: { in: [hospitalId, otherHospitalId] } } },
    });
    await prisma.appointment.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.leave.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.rosterEntry.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.resource.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.user.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.role.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.patient.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.branch.updateMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
      data: { workScheduleId: null },
    });
    await prisma.hospital.updateMany({
      where: { id: { in: [hospitalId, otherHospitalId] } },
      data: { defaultWorkScheduleId: null },
    });
    await prisma.workSchedule.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.branch.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.hospital.deleteMany({
      where: { id: { in: [hospitalId, otherHospitalId] } },
    });
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

  async function assignHospitalSchedule(
    workStartTime: string,
    workEndTime: string,
    timezone = 'Asia/Kolkata',
  ) {
    const ws = await prisma.workSchedule.create({
      data: { hospitalId, workStartTime, workEndTime, timezone },
    });
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultWorkScheduleId: ws.id },
    });
    return ws;
  }

  async function assignBranchSchedule(branchId: string, wsId: string) {
    await prisma.branch.update({
      where: { id: branchId },
      data: { workScheduleId: wsId },
    });
  }

  let slotDayCounter = 0;
  async function bookInsideDefaultSchedule(resourceIds: string[]) {
    slotDayCounter += 1;
    const day = 10 + (slotDayCounter % 10);
    const startAt = `2028-03-${String(day).padStart(2, '0')}T04:30:00.000Z`;
    const endAt = `2028-03-${String(day).padStart(2, '0')}T05:00:00.000Z`;
    return appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds,
      startAt,
      endAt,
    });
  }

  itDb('allows appointment inside hospital work schedule (IST)', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    await expect(
      bookInsideDefaultSchedule([doctorResourceId]),
    ).resolves.toBeDefined();
  });

  itDb('rejects appointment starting before work schedule', async () => {
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-01T03:29:00.000Z',
        endAt: '2028-04-01T04:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('rejects appointment ending after work schedule', async () => {
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-02T11:15:00.000Z',
        endAt: '2028-04-02T11:31:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('branch schedule overrides hospital schedule', async () => {
    await assignHospitalSchedule('09:00', '12:00');
    const branchWs = await prisma.workSchedule.create({
      data: {
        hospitalId,
        workStartTime: '09:00',
        workEndTime: '17:00',
        timezone: 'Asia/Kolkata',
      },
    });
    await assignBranchSchedule(branchA, branchWs.id);

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-03T11:00:00.000Z',
        endAt: '2028-04-03T11:30:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('provider roster shift restricts booking when entry exists', async () => {
    await prisma.rosterEntry.create({
      data: {
        hospitalId,
        branchId: branchA,
        userId: doctorUserId,
        date: new Date(Date.UTC(2028, 3, 4)),
        shiftStartTime: '10:00',
        shiftEndTime: '12:00',
      },
    });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-04T04:00:00.000Z',
        endAt: '2028-04-04T04:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-04T04:30:00.000Z',
        endAt: '2028-04-04T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('provider without roster entry is not blocked by roster alone', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-05T04:30:00.000Z',
        endAt: '2028-04-05T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('resource without userId still respects branch work schedule', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [roomResourceId],
        startAt: '2028-04-06T04:30:00.000Z',
        endAt: '2028-04-06T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('rejects roster from another branch for provider resource', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    await prisma.rosterEntry.create({
      data: {
        hospitalId,
        branchId: branchB,
        userId: doctorUserId,
        date: new Date(Date.UTC(2028, 3, 7)),
        shiftStartTime: '09:00',
        shiftEndTime: '17:00',
      },
    });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-07T04:30:00.000Z',
        endAt: '2028-04-07T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('portal slots respect work schedule window', async () => {
    await assignHospitalSchedule('09:00', '17:00', 'Asia/Kolkata');
    const result = await policy.generatePortalAvailableSlots({
      hospitalId,
      branchId: branchA,
      resourceIds: [doctorResourceId],
      date: '2028-04-08',
      slotDurationMinutes: 15,
      durationMinutes: 15,
    });

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.every((s) => s.startAt.includes('T'))).toBe(true);
    const beforeOpen = result.slots.find(
      (s) => s.startAt === '2028-04-08T03:15:00.000Z',
    );
    expect(beforeOpen).toBeUndefined();
    const atOpen = result.slots.find(
      (s) => s.startAt === '2028-04-08T03:30:00.000Z',
    );
    expect(atOpen).toBeDefined();
  });

  itDb('reschedule re-validates work schedule', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    const appt = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorResourceId],
      startAt: '2028-04-09T04:30:00.000Z',
      endAt: '2028-04-09T05:00:00.000Z',
    });

    await expect(
      appointmentsService.update(staffUser, appt.id, {
        startAt: '2028-04-09T11:15:00.000Z',
        endAt: '2028-04-09T11:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('no work schedule preserves booking without calendar enforcement', async () => {
    await prisma.hospital.update({
      where: { id: hospitalId },
      data: { defaultWorkScheduleId: null },
    });
    await prisma.branch.update({
      where: { id: branchA },
      data: { workScheduleId: null },
    });

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-10T02:00:00.000Z',
        endAt: '2028-04-10T02:30:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('cancelled appointments remain non-blocking for conflicts', async () => {
    await assignHospitalSchedule('09:00', '17:00');
    const first = await appointmentsService.create(staffUser, {
      patientId,
      branchId: branchA,
      resourceIds: [doctorResourceId],
      startAt: '2028-04-11T04:30:00.000Z',
      endAt: '2028-04-11T05:00:00.000Z',
    });
    await appointmentsService.cancel(staffUser, first.id);

    await expect(
      appointmentsService.create(staffUser, {
        patientId,
        branchId: branchA,
        resourceIds: [doctorResourceId],
        startAt: '2028-04-11T04:30:00.000Z',
        endAt: '2028-04-11T05:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });
});
