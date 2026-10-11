import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, BedType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { IpdBedService } from './ipd-bed.service';

describe('IpdBedService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const bedIdA = 'bed-a';
  const bedIdB = 'bed-b';

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
    ipdBed: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    branch: { findUnique: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: IpdBedService;

  const bedA = {
    id: bedIdA,
    hospitalId,
    branchId: branchA,
    wardName: 'General',
    roomNumber: '101',
    bedNumber: '1',
    bedType: BedType.GENERAL,
    status: BedStatus.AVAILABLE,
    notes: null,
    branch: {},
  };

  beforeEach(() => {
    prisma = {
      ipdBed: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      branch: { findUnique: jest.fn() },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new IpdBedService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('listBeds', () => {
    it('scopes branch user list to JWT branch', async () => {
      await service.listBeds(branchUser, { branchId: branchB });

      const where = prisma.ipdBed.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listBeds(hospitalWideUser, { branchId: branchB });

      const where = prisma.ipdBed.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });
  });

  describe('getBed', () => {
    it('allows branch user to get own-branch bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue(bedA);

      const bed = await service.getBed(branchUser, bedIdA);

      expect(bed.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        ...bedA,
        id: bedIdB,
        branchId: branchB,
      });

      await expect(service.getBed(branchUser, bedIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital bed as not found', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue(null);

      await expect(service.getBed(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createBed', () => {
    it('forces JWT branch for branch-scoped user', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.ipdBed.create.mockResolvedValue({ ...bedA });

      const bed = await service.createBed(branchUser, {
        branchId: branchB,
        wardName: 'General',
        roomNumber: '102',
        bedNumber: '2',
        bedType: BedType.GENERAL,
      });

      expect(bed.branchId).toBe(branchA);
      expect(prisma.ipdBed.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });
  });

  describe('updateBed and deactivateBed', () => {
    it('allows branch user to update own-branch bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue(bedA);
      prisma.ipdBed.update.mockResolvedValue({ ...bedA, notes: 'Updated' });

      const bed = await service.updateBed(branchUser, bedIdA, {
        notes: 'Updated',
      });

      expect(bed.notes).toBe('Updated');
    });

    it('denies branch user updating another branch bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        ...bedA,
        id: bedIdB,
        branchId: branchB,
      });

      await expect(
        service.updateBed(branchUser, bedIdB, { notes: 'Blocked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves occupied-bed status rule for authorized user', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        ...bedA,
        status: BedStatus.OCCUPIED,
      });

      await expect(
        service.updateBed(branchUser, bedIdA, { status: BedStatus.AVAILABLE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies branch user deactivating another branch bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        ...bedA,
        id: bedIdB,
        branchId: branchB,
        status: BedStatus.AVAILABLE,
      });

      await expect(
        service.deactivateBed(branchUser, bedIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows branch user to deactivate own-branch available bed', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue(bedA);
      prisma.ipdBed.update.mockResolvedValue({
        ...bedA,
        status: BedStatus.INACTIVE,
      });

      const bed = await service.deactivateBed(branchUser, bedIdA);

      expect(bed.status).toBe(BedStatus.INACTIVE);
    });

    it('preserves deactivate conflict when bed is occupied', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        ...bedA,
        status: BedStatus.OCCUPIED,
      });

      await expect(service.deactivateBed(branchUser, bedIdA)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
