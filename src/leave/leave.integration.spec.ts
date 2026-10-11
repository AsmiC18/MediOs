import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveStatus,
  PrismaClient,
  ResourceStatus,
  ResourceType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { LeaveService } from './leave.service';

describe('Leave integration (S2B)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let service: LeaveService;
  let hospitalId: string;
  let otherHospitalId: string;
  let branchA: string;
  let branchB: string;
  let providerUserId: string;
  let otherHospitalUserId: string;

  const hospitalAdmin = {
    sub: 'leave-admin',
    hospitalId: '',
    branchId: null as string | null,
  };
  const branchAUser = {
    sub: 'leave-branch-a',
    hospitalId: '',
    branchId: '' as string,
  };

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      return;
    }

    service = new LeaveService(
      prisma as never,
      { log: jest.fn() } as unknown as AuditService,
    );

    hospitalId = (
      await prisma.hospital.create({
        data: { name: `Leave ${runId}`, code: `LV-${runId}` },
      })
    ).id;
    hospitalAdmin.hospitalId = hospitalId;
    branchAUser.hospitalId = hospitalId;

    otherHospitalId = (
      await prisma.hospital.create({
        data: { name: `Leave Other ${runId}`, code: `LVO-${runId}` },
      })
    ).id;

    branchA = (
      await prisma.branch.create({
        data: { hospitalId, name: 'A', code: `LVA-${runId}` },
      })
    ).id;
    branchB = (
      await prisma.branch.create({
        data: { hospitalId, name: 'B', code: `LVB-${runId}` },
      })
    ).id;
    branchAUser.branchId = branchA;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R-${runId}` },
    });
    providerUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          branchId: branchA,
          roleId: role.id,
          name: 'Provider',
          passwordHash: 'hash',
        },
      })
    ).id;

    const otherRole = await prisma.role.create({
      data: { hospitalId: otherHospitalId, name: `OR-${runId}` },
    });
    otherHospitalUserId = (
      await prisma.user.create({
        data: {
          hospitalId: otherHospitalId,
          roleId: otherRole.id,
          name: 'Other',
          passwordHash: 'hash',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.leave.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.user.deleteMany({
      where: { hospitalId: { in: [hospitalId, otherHospitalId] } },
    });
    await prisma.role.deleteMany({
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

  itDb('creates and lists leave', async () => {
    const created = await service.create(hospitalAdmin, {
      userId: providerUserId,
      branchId: branchA,
      startAt: '2028-05-01T04:00:00.000Z',
      endAt: '2028-05-01T05:00:00.000Z',
      reason: 'Personal',
    });
    expect(created.status).toBe(LeaveStatus.ACTIVE);

    const list = await service.findAll(hospitalAdmin, { userId: providerUserId });
    expect(list.some((l) => l.id === created.id)).toBe(true);

    const one = await service.findOne(hospitalAdmin, created.id);
    expect(one.id).toBe(created.id);
  });

  itDb('updates active leave', async () => {
    const created = await service.create(hospitalAdmin, {
      userId: providerUserId,
      startAt: '2028-05-02T04:00:00.000Z',
      endAt: '2028-05-02T05:00:00.000Z',
    });
    const updated = await service.update(hospitalAdmin, created.id, {
      reason: 'Updated note',
    });
    expect(updated.reason).toBe('Updated note');
  });

  itDb('cancels active leave', async () => {
    const created = await service.create(hospitalAdmin, {
      userId: providerUserId,
      startAt: '2028-05-03T04:00:00.000Z',
      endAt: '2028-05-03T05:00:00.000Z',
    });
    const cancelled = await service.cancel(hospitalAdmin, created.id);
    expect(cancelled.status).toBe(LeaveStatus.CANCELLED);
  });

  itDb('rejects endAt <= startAt', async () => {
    await expect(
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-05-04T05:00:00.000Z',
        endAt: '2028-05-04T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  itDb('rejects overlapping active leave', async () => {
    await service.create(hospitalAdmin, {
      userId: providerUserId,
      startAt: '2028-05-05T09:00:00.000Z',
      endAt: '2028-05-05T10:00:00.000Z',
    });
    await expect(
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-05-05T09:30:00.000Z',
        endAt: '2028-05-05T10:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  itDb('allows touching leave boundaries', async () => {
    await service.create(hospitalAdmin, {
      userId: providerUserId,
      startAt: '2028-05-06T09:00:00.000Z',
      endAt: '2028-05-06T10:00:00.000Z',
    });
    await expect(
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-05-06T10:00:00.000Z',
        endAt: '2028-05-06T11:00:00.000Z',
      }),
    ).resolves.toBeDefined();
  });

  itDb('rejects unknown user in hospital', async () => {
    await expect(
      service.create(hospitalAdmin, {
        userId: otherHospitalUserId,
        startAt: '2028-05-07T04:00:00.000Z',
        endAt: '2028-05-07T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('rejects invalid branch', async () => {
    await expect(
      service.create(hospitalAdmin, {
        userId: providerUserId,
        branchId: '00000000-0000-0000-0000-000000000000',
        startAt: '2028-05-08T04:00:00.000Z',
        endAt: '2028-05-08T05:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  itDb('hospital isolation on get leave', async () => {
    const otherAdmin = {
      sub: 'other-admin',
      hospitalId: otherHospitalId,
      branchId: null,
    };
    const created = await service.create(hospitalAdmin, {
      userId: providerUserId,
      startAt: '2028-05-09T04:00:00.000Z',
      endAt: '2028-05-09T05:00:00.000Z',
    });
    await expect(service.findOne(otherAdmin, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  itDb('branch-scoped user cannot read leave from another branch', async () => {
    const created = await service.create(hospitalAdmin, {
      userId: providerUserId,
      branchId: branchB,
      startAt: '2028-05-10T04:00:00.000Z',
      endAt: '2028-05-10T05:00:00.000Z',
    });
    await expect(service.findOne(branchAUser, created.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  itDb('allows creating leave that overlaps a future appointment (no auto-cancel)', async () => {
    const patient = await prisma.patient.create({
      data: {
        hospitalId,
        branchId: branchA,
        phone: `7${runId.replace(/\D/g, '').slice(0, 9)}`.slice(0, 15),
        firstName: 'Pat',
      },
    });
    const resource = await prisma.resource.create({
      data: {
        hospitalId,
        branchId: branchA,
        userId: providerUserId,
        type: ResourceType.DOCTOR,
        name: 'Dr',
        status: ResourceStatus.ACTIVE,
      },
    });
    const appt = await prisma.appointment.create({
      data: {
        hospitalId,
        branchId: branchA,
        patientId: patient.id,
        startAt: new Date('2028-05-11T04:30:00.000Z'),
        endAt: new Date('2028-05-11T05:00:00.000Z'),
        status: 'SCHEDULED',
        resources: { create: { resourceId: resource.id } },
      },
    });

    await expect(
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-05-11T04:00:00.000Z',
        endAt: '2028-05-11T06:00:00.000Z',
      }),
    ).resolves.toBeDefined();

    const unchanged = await prisma.appointment.findUniqueOrThrow({
      where: { id: appt.id },
    });
    expect(unchanged.status).toBe('SCHEDULED');

    await prisma.appointmentResource.deleteMany({ where: { appointmentId: appt.id } });
    await prisma.appointment.delete({ where: { id: appt.id } });
    await prisma.resource.delete({ where: { id: resource.id } });
    await prisma.patient.delete({ where: { id: patient.id } });
  });
});
