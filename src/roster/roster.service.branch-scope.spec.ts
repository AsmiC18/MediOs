import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RosterService } from './roster.service';

describe('RosterService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const staffUserId = 'staff-user-1';
  const entryIdA = 'entry-a';
  const entryIdB = 'entry-b';

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
    rosterEntry: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: RosterService;

  const entryBranchA = {
    id: entryIdA,
    hospitalId,
    branchId: branchA,
    userId: staffUserId,
    date: new Date('2026-01-15T00:00:00.000Z'),
    shiftStartTime: '09:00',
    shiftEndTime: '17:00',
    notes: null,
  };

  const entryBranchB = {
    id: entryIdB,
    hospitalId,
    branchId: branchB,
    userId: staffUserId,
    date: new Date('2026-01-16T00:00:00.000Z'),
    shiftStartTime: '09:00',
    shiftEndTime: '17:00',
    notes: null,
  };

  beforeEach(() => {
    prisma = {
      rosterEntry: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: staffUserId,
          hospitalId,
        }),
      },
      branch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) =>
          Promise.resolve(
            id === branchA || id === branchB
              ? { id, hospitalId }
              : null,
          ),
        ),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new RosterService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('findAll', () => {
    it('lists only JWT branch for branch-scoped user', async () => {
      await service.findAll(branchUser, {});

      expect(prisma.rosterEntry.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('does not allow query branchId to override JWT branch', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      expect(prisma.rosterEntry.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide user to filter by branch', async () => {
      await service.findAll(hospitalWideUser, { branchId: branchB });

      expect(prisma.rosterEntry.findMany.mock.calls[0][0].where.branchId).toBe(
        branchB,
      );
    });

    it('allows hospital-wide user to list across branches without filter', async () => {
      await service.findAll(hospitalWideUser, {});

      expect(
        prisma.rosterEntry.findMany.mock.calls[0][0].where.branchId,
      ).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('returns own-branch entry', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue(entryBranchA);

      const result = await service.findOne(branchUser, entryIdA);

      expect(result.id).toBe(entryIdA);
    });

    it('denies cross-branch get', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue(entryBranchB);

      await expect(service.findOne(branchUser, entryIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies cross-hospital get as not found', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue({
        ...entryBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(service.findOne(branchUser, entryIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const createDto = {
      userId: staffUserId,
      date: '2026-01-20',
      shiftStartTime: '09:00',
      shiftEndTime: '17:00',
    };

    beforeEach(() => {
      prisma.rosterEntry.findUnique.mockResolvedValue(null);
      prisma.rosterEntry.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-entry', ...data }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      await service.create(branchUser, {
        ...createDto,
        branchId: branchB,
      });

      expect(prisma.rosterEntry.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide user to set branch from DTO', async () => {
      await service.create(hospitalWideUser, {
        ...createDto,
        branchId: branchB,
      });

      expect(prisma.rosterEntry.create.mock.calls[0][0].data.branchId).toBe(
        branchB,
      );
    });
  });

  describe('update', () => {
    it('allows own-branch update', async () => {
      prisma.rosterEntry.findUnique
        .mockResolvedValueOnce(entryBranchA)
        .mockResolvedValueOnce(null);
      prisma.rosterEntry.update.mockResolvedValue({
        ...entryBranchA,
        notes: 'Updated',
      });

      const result = await service.update(branchUser, entryIdA, {
        notes: 'Updated',
      });

      expect(result.notes).toBe('Updated');
    });

    it('denies cross-branch update', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue(entryBranchB);

      await expect(
        service.update(branchUser, entryIdB, { notes: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.rosterEntry.update).not.toHaveBeenCalled();
    });

    it('denies branch user from reassigning entry to another branch', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue(entryBranchA);

      await expect(
        service.update(branchUser, entryIdA, { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('denies cross-branch delete', async () => {
      prisma.rosterEntry.findUnique.mockResolvedValue(entryBranchB);

      await expect(service.remove(branchUser, entryIdB)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.rosterEntry.delete).not.toHaveBeenCalled();
    });
  });
});
