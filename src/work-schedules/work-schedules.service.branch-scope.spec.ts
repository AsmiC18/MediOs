import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorkSchedulesService } from './work-schedules.service';

describe('WorkSchedulesService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const scheduleId = 'schedule-1';

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

  const workSchedule = {
    id: scheduleId,
    hospitalId,
    workStartTime: '09:00',
    workEndTime: '17:00',
    timezone: 'Asia/Kolkata',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: {
    workSchedule: { findUnique: jest.Mock; update: jest.Mock };
    branch: { findUnique: jest.Mock; update: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: WorkSchedulesService;

  beforeEach(() => {
    prisma = {
      workSchedule: {
        findUnique: jest.fn().mockResolvedValue(workSchedule),
        update: jest.fn(),
      },
      branch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) =>
          Promise.resolve(
            id === branchA || id === branchB
              ? { id, hospitalId }
              : null,
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new WorkSchedulesService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('assignBranch', () => {
    it('allows branch-scoped user to assign override to own branch', async () => {
      await service.assignBranch(branchUser, scheduleId, branchA);

      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: branchA },
        data: { workScheduleId: scheduleId },
      });
    });

    it('denies branch-scoped user assigning another branch', async () => {
      await expect(
        service.assignBranch(branchUser, scheduleId, branchB),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.branch.update).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to assign another branch', async () => {
      await service.assignBranch(hospitalWideUser, scheduleId, branchB);

      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: branchB },
        data: { workScheduleId: scheduleId },
      });
    });

    it('preserves not found when branch is outside hospital', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.assignBranch(branchUser, scheduleId, branchA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeBranchOverride', () => {
    it('allows branch-scoped user to remove own branch override', async () => {
      const result = await service.removeBranchOverride(branchUser, branchA);

      expect(result.branchId).toBe(branchA);
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: branchA },
        data: { workScheduleId: null },
      });
    });

    it('denies branch-scoped user removing another branch override', async () => {
      await expect(
        service.removeBranchOverride(branchUser, branchB),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.branch.update).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to remove another branch override', async () => {
      await service.removeBranchOverride(hospitalWideUser, branchB);

      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: branchB },
        data: { workScheduleId: null },
      });
    });
  });
});
