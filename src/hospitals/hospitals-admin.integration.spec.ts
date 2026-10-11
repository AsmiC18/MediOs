import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { HospitalsService } from './hospitals.service';

describe('Hospital and branch administration', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '22222222-2222-4222-8222-222222222222';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const hospitalWide = {
    sub: 'admin-1',
    hospitalId,
    branchId: null as string | null,
  };
  const branchScoped = {
    sub: 'mgr-1',
    hospitalId,
    branchId: branchA,
  };

  describe('unit', () => {
    let prisma: {
      hospital: { findUnique: jest.Mock; update: jest.Mock };
      branch: {
        findMany: jest.Mock;
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
      };
      user: { count: jest.Mock };
    };
    let audit: { log: jest.Mock };
    let hospitalsService: HospitalsService;

    beforeEach(() => {
      prisma = {
        hospital: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        branch: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        user: { count: jest.fn().mockResolvedValue(0) },
      };
      audit = { log: jest.fn().mockResolvedValue(undefined) };
      hospitalsService = new HospitalsService(
        prisma as never,
        audit as never,
      );
    });

    it('denies cross-hospital hospital read', async () => {
      await expect(
        hospitalsService.getHospital(hospitalWide, otherHospitalId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lists all branches for hospital-wide user', async () => {
      prisma.branch.findMany.mockResolvedValue([{ id: branchA }, { id: branchB }]);
      const rows = await hospitalsService.listBranches(hospitalWide);
      expect(rows).toHaveLength(2);
      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hospitalId },
        }),
      );
    });

    it('lists only own branch for branch-scoped user', async () => {
      prisma.branch.findMany.mockResolvedValue([{ id: branchA }]);
      await hospitalsService.listBranches(branchScoped);
      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hospitalId, branchId: branchA },
        }),
      );
    });

    it('branch create requires hospital-wide administrator', async () => {
      await expect(
        hospitalsService.createBranch(branchScoped, {
          name: 'New',
          code: 'NEW',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('audits hospital update', async () => {
      prisma.hospital.findUnique.mockResolvedValue({
        id: hospitalId,
        name: 'Old',
        code: 'H1',
      });
      prisma.hospital.update.mockResolvedValue({
        id: hospitalId,
        name: 'New Name',
        code: 'H1',
        gstin: null,
        stateCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await hospitalsService.updateMyHospital(hospitalWide, { name: 'New Name' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'HOSPITAL_UPDATED' }),
      );
    });

    it('blocks deactivation when active users remain', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchA,
        hospitalId,
        name: 'A',
        code: 'A',
        address: null,
        isActive: true,
      });
      prisma.user.count.mockResolvedValue(2);

      await expect(
        hospitalsService.updateBranch(hospitalWide, branchA, { isActive: false }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('integration', () => {
    const prisma = new PrismaClient();
    let dbAvailable = false;
    let dbHospitalId: string;
    let dbBranchId: string;
    let dbUserId: string;
    let hospitalsService: HospitalsService;
    let usersService: UsersService;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    beforeAll(async () => {
      try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        dbAvailable = true;
      } catch {
        return;
      }

      const audit = new AuditService(prisma as never);
      hospitalsService = new HospitalsService(prisma as never, audit);
      usersService = new UsersService(prisma as never, audit);

      const hospital = await prisma.hospital.create({
        data: {
          name: `Tenant Admin ${runId}`,
          code: `TA-${runId}`,
          branches: {
            create: [
              { name: 'Main', code: 'MAIN' },
              { name: 'Annex', code: 'ANNEX' },
            ],
          },
        },
        include: { branches: true },
      });
      dbHospitalId = hospital.id;
      dbBranchId = hospital.branches[0]!.id;

      const role = await prisma.role.create({
        data: { hospitalId: dbHospitalId, name: `R-${runId}` },
      });

      dbUserId = (
        await prisma.user.create({
          data: {
            hospitalId: dbHospitalId,
            branchId: dbBranchId,
            roleId: role.id,
            name: 'Staff',
            email: `staff-${runId}@test.com`,
            passwordHash: 'hash',
            status: UserStatus.ACTIVE,
          },
        })
      ).id;
    });

    afterAll(async () => {
      if (!dbAvailable) {
        return;
      }
      await prisma.user.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prisma.role.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prisma.branch.deleteMany({ where: { hospitalId: dbHospitalId } });
      await prisma.hospital.delete({ where: { id: dbHospitalId } });
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

    itDb('creates branch under JWT hospital', async () => {
      const branch = await hospitalsService.createBranch(
        { sub: dbUserId, hospitalId: dbHospitalId, branchId: null },
        { name: `Site ${runId}`, code: `S${runId.slice(-4)}` },
      );
      expect(branch.hospitalId).toBe(dbHospitalId);
      expect(branch.isActive).toBe(true);
    });

    itDb('assigns user branch within hospital', async () => {
      const annex = await prisma.branch.findFirst({
        where: { hospitalId: dbHospitalId, code: 'ANNEX' },
      });
      expect(annex).toBeTruthy();

      const result = await usersService.assignBranch(
        { sub: dbUserId, hospitalId: dbHospitalId, branchId: null, roleId: 'r' },
        dbUserId,
        { branchId: annex!.id },
      );
      expect(result.branchId).toBe(annex!.id);
    });

    itDb('rejects inactive branch assignment', async () => {
      const inactive = await prisma.branch.update({
        where: { id: dbBranchId },
        data: { isActive: false },
      });

      await prisma.user.update({
        where: { id: dbUserId },
        data: { branchId: null },
      });

      await expect(
        usersService.assignBranch(
          { sub: dbUserId, hospitalId: dbHospitalId, branchId: null, roleId: 'r' },
          dbUserId,
          { branchId: inactive.id },
        ),
      ).rejects.toThrow(BadRequestException);

      await prisma.branch.update({
        where: { id: dbBranchId },
        data: { isActive: true },
      });
    });

    itDb('denies access to other hospital branch', async () => {
      const other = await prisma.hospital.create({
        data: { name: 'Other', code: `OTH-${runId}` },
      });
      try {
        await expect(
          hospitalsService.getBranch(
            { sub: 'x', hospitalId: dbHospitalId, branchId: null },
            other.id,
          ),
        ).rejects.toThrow(NotFoundException);
      } finally {
        await prisma.hospital.delete({ where: { id: other.id } });
      }
    });
  });
});
