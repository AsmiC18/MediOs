import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AttendanceService } from './attendance.service';

describe('AttendanceService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const attendanceIdA = 'attendance-a';
  const attendanceIdB = 'attendance-b';
  const targetUserId = 'staff-user-1';

  const branchUser = {
    sub: 'user-branch-a',
    hospitalId,
    branchId: branchA,
  };

  const hospitalWideUser = {
    sub: 'user-hospital-wide',
    hospitalId,
    branchId: null as string | null,
  };

  let prisma: {
    attendance: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    branch: { findUnique: jest.Mock };
    hospital: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    rosterEntry: { findUnique: jest.Mock };
    resource: { findFirst: jest.Mock };
    appointment: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let domainEventOutboxService: {
    createInTransaction: jest.Mock;
    enqueueStaffAttendanceConsultationInTransaction: jest.Mock;
  };
  let service: AttendanceService;

  const attendanceBranchA = {
    id: attendanceIdA,
    hospitalId,
    branchId: branchA,
    userId: targetUserId,
    date: new Date('2026-01-15T00:00:00.000Z'),
    clockIn: new Date(),
    clockOut: null,
    status: AttendanceStatus.PRESENT,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
  };

  const attendanceBranchB = {
    id: attendanceIdB,
    hospitalId,
    branchId: branchB,
    userId: targetUserId,
    date: new Date('2026-01-15T00:00:00.000Z'),
    clockIn: new Date(),
    clockOut: null,
    status: AttendanceStatus.PRESENT,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
  };

  beforeEach(() => {
    prisma = {
      attendance: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) =>
          Promise.resolve(
            id === branchA || id === branchB
              ? { id, hospitalId, workSchedule: null }
              : null,
          ),
        ),
      },
      hospital: {
        findUnique: jest.fn().mockResolvedValue({
          id: hospitalId,
          defaultWorkSchedule: null,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: targetUserId,
          hospitalId,
        }),
      },
      rosterEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      resource: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn) =>
        fn({
          attendance: prisma.attendance,
          rosterEntry: prisma.rosterEntry,
          resource: prisma.resource,
          appointment: prisma.appointment,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    domainEventOutboxService = {
      createInTransaction: jest.fn(),
      enqueueStaffAttendanceConsultationInTransaction: jest.fn(),
    };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      domainEventOutboxService as unknown as import('../notifications/domain-event-outbox.service').DomainEventOutboxService,
    );
  });

  describe('findAll', () => {
    it('scopes branch user to JWT branch', async () => {
      await service.findAll(branchUser, {});

      expect(prisma.attendance.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('does not allow query branchId to widen branch user scope', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      expect(prisma.attendance.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide branch filter', async () => {
      await service.findAll(hospitalWideUser, { branchId: branchB });

      expect(prisma.attendance.findMany.mock.calls[0][0].where.branchId).toBe(
        branchB,
      );
    });
  });

  describe('findOne', () => {
    it('returns own-branch attendance', async () => {
      prisma.attendance.findUnique.mockResolvedValue(attendanceBranchA);

      const result = await service.findOne(branchUser, attendanceIdA);

      expect(result.id).toBe(attendanceIdA);
    });

    it('denies cross-branch get', async () => {
      prisma.attendance.findUnique.mockResolvedValue(attendanceBranchB);

      await expect(service.findOne(branchUser, attendanceIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('preserves cross-hospital denial', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...attendanceBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(service.findOne(branchUser, attendanceIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('clockIn', () => {
    it('stores JWT branch for branch-scoped user', async () => {
      prisma.attendance.findUnique.mockResolvedValue(null);
      prisma.attendance.create.mockResolvedValue({
        id: 'new-attendance',
        branchId: branchA,
      });

      await service.clockIn({ ...branchUser, sub: targetUserId });

      expect(prisma.attendance.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });
  });

  describe('clockOut', () => {
    it('denies clock-out on cross-branch attendance for branch user', async () => {
      prisma.attendance.findUnique.mockResolvedValue(attendanceBranchB);

      await expect(service.clockOut(branchUser)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.attendance.update).not.toHaveBeenCalled();
    });

    it('preserves business rule when already clocked out', async () => {
      prisma.attendance.findUnique.mockResolvedValue({
        ...attendanceBranchA,
        userId: branchUser.sub,
        clockOut: new Date(),
      });

      await expect(service.clockOut(branchUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
