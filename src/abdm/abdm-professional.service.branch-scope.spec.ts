import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmProfessionalService } from './abdm-professional.service';

describe('AbdmProfessionalService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const userIdA = 'staff-user-a';
  const userIdB = 'staff-user-b';
  const validHprId = '12-3456-7890-1234';

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

  const userBranchA = {
    id: userIdA,
    hospitalId,
    branchId: branchA,
  };

  const userBranchB = {
    id: userIdB,
    hospitalId,
    branchId: branchB,
  };

  let prisma: {
    user: { findUnique: jest.Mock };
    abdmProfessionalLink: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let service: AbdmProfessionalService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      abdmProfessionalLink: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AbdmProfessionalService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('getProfessionalLink', () => {
    it('allows branch-scoped user to get own-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue({
        hospitalId,
        userId: userIdA,
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: new Date(),
      });

      const result = await service.getProfessionalLink(branchUser, userIdA);

      expect(result.hprId).toBe(validHprId);
    });

    it('denies branch-scoped user getting another-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await expect(
        service.getProfessionalLink(branchUser, userIdB),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmProfessionalLink.findUnique).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to get another-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue(null);

      const result = await service.getProfessionalLink(
        hospitalWideUser,
        userIdB,
      );

      expect(result.userId).toBe(userIdB);
      expect(result.linkStatus).toBe(AbdmRegistrationStatus.NOT_REGISTERED);
    });

    it('preserves not found for missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfessionalLink(branchUser, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('preserves hospital mismatch as not found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(
        service.getProfessionalLink(branchUser, userIdA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfessionalLink', () => {
    beforeEach(() => {
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue(null);
      prisma.abdmProfessionalLink.upsert.mockResolvedValue({
        id: 'link-1',
        hospitalId,
        userId: userIdA,
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: new Date(),
      });
    });

    it('allows branch-scoped user to update own-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);

      const result = await service.updateProfessionalLink(branchUser, userIdA, {
        hprId: validHprId,
      });

      expect(result.hprId).toBe(validHprId);
      expect(prisma.abdmProfessionalLink.upsert).toHaveBeenCalled();
    });

    it('denies branch-scoped user updating another-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await expect(
        service.updateProfessionalLink(branchUser, userIdB, {
          hprId: validHprId,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmProfessionalLink.upsert).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to update another-branch professional link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await service.updateProfessionalLink(hospitalWideUser, userIdB, {
        hprId: validHprId,
      });

      expect(prisma.abdmProfessionalLink.upsert).toHaveBeenCalled();
    });

    it('preserves business rule blocking direct REGISTERED status', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);

      await expect(
        service.updateProfessionalLink(branchUser, userIdA, {
          linkStatus: AbdmRegistrationStatus.REGISTERED,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.abdmProfessionalLink.upsert).not.toHaveBeenCalled();
    });
  });
});
