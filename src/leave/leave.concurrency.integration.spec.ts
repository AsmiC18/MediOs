import { ConflictException } from '@nestjs/common';
import { LeaveStatus, PrismaClient } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PROVIDER_LEAVE_CONFLICT_MESSAGE } from '../scheduling/scheduling-leave.util';
import { LeaveService } from './leave.service';

describe('Leave concurrency integration (S2B)', () => {
  const prisma = new PrismaClient();
  let dbAvailable = false;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let service: LeaveService;
  let hospitalId: string;
  let providerUserId: string;
  let otherProviderUserId: string;

  const hospitalAdmin = {
    sub: 'leave-concurrency-admin',
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

    service = new LeaveService(
      prisma as never,
      { log: jest.fn() } as unknown as AuditService,
    );

    hospitalId = (
      await prisma.hospital.create({
        data: { name: `Leave Conc ${runId}`, code: `LVC-${runId}` },
      })
    ).id;
    hospitalAdmin.hospitalId = hospitalId;

    const role = await prisma.role.create({
      data: { hospitalId, name: `R-${runId}` },
    });
    providerUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: role.id,
          name: 'Provider A',
          passwordHash: 'hash',
        },
      })
    ).id;
    otherProviderUserId = (
      await prisma.user.create({
        data: {
          hospitalId,
          roleId: role.id,
          name: 'Provider B',
          passwordHash: 'hash',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (!dbAvailable) {
      return;
    }
    await prisma.leave.deleteMany({ where: { hospitalId } });
    await prisma.user.deleteMany({ where: { hospitalId } });
    await prisma.role.deleteMany({ where: { hospitalId } });
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

  itDb('serializes overlapping concurrent creates: one success, one conflict', async () => {
    const overlapStart = '2028-07-01T09:00:00.000Z';
    const overlapEnd = '2028-07-01T10:00:00.000Z';

    const results = await Promise.allSettled([
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: overlapStart,
        endAt: overlapEnd,
      }),
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: overlapStart,
        endAt: overlapEnd,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ConflictException);
    expect(failure.reason.message).toBe(PROVIDER_LEAVE_CONFLICT_MESSAGE);

    const activeRows = await prisma.leave.findMany({
      where: {
        hospitalId,
        userId: providerUserId,
        status: LeaveStatus.ACTIVE,
        startAt: new Date(overlapStart),
        endAt: new Date(overlapEnd),
      },
    });
    expect(activeRows).toHaveLength(1);
  });

  itDb('allows non-overlapping concurrent creates for the same user', async () => {
    const results = await Promise.allSettled([
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-07-02T09:00:00.000Z',
        endAt: '2028-07-02T10:00:00.000Z',
      }),
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-07-02T10:00:00.000Z',
        endAt: '2028-07-02T11:00:00.000Z',
      }),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const rows = await prisma.leave.findMany({
      where: {
        hospitalId,
        userId: providerUserId,
        status: LeaveStatus.ACTIVE,
        startAt: { gte: new Date('2028-07-02T00:00:00.000Z') },
      },
    });
    expect(rows).toHaveLength(2);
  });

  itDb('does not block concurrent creates for different users in the same hospital', async () => {
    const results = await Promise.allSettled([
      service.create(hospitalAdmin, {
        userId: providerUserId,
        startAt: '2028-07-03T09:00:00.000Z',
        endAt: '2028-07-03T10:00:00.000Z',
      }),
      service.create(hospitalAdmin, {
        userId: otherProviderUserId,
        startAt: '2028-07-03T09:00:00.000Z',
        endAt: '2028-07-03T10:00:00.000Z',
      }),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });
});
