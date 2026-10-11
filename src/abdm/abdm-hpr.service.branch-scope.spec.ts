import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHprService } from './abdm-hpr.service';

describe('AbdmHprService branch scope', () => {
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
    abdmProfessionalLink: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditService: { log: jest.Mock };
  let environmentService: { isMockMode: jest.Mock };
  let service: AbdmHprService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      abdmProfessionalLink: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    environmentService = { isMockMode: jest.fn().mockReturnValue(true) };
    service = new AbdmHprService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      environmentService as unknown as AbdmEnvironmentService,
    );
  });

  describe('getHprLink', () => {
    it('allows branch-scoped user to get own-branch user HPR link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue({
        hospitalId,
        userId: userIdA,
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: new Date(),
      });

      const result = await service.getHprLink(branchUser, userIdA);

      expect(result.hprId).toBe(validHprId);
    });

    it('denies branch-scoped user getting another-branch user HPR link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await expect(service.getHprLink(branchUser, userIdB)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.abdmProfessionalLink.findUnique).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to get another-branch user HPR link', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue(null);

      const result = await service.getHprLink(hospitalWideUser, userIdB);

      expect(result.userId).toBe(userIdB);
      expect(result.linkStatus).toBe(AbdmRegistrationStatus.NOT_REGISTERED);
    });

    it('preserves not found for missing user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getHprLink(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('preserves hospital mismatch as not found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(service.getHprLink(branchUser, userIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('linkHpr', () => {
    beforeEach(() => {
      prisma.abdmProfessionalLink.upsert.mockResolvedValue({
        id: 'link-1',
        hospitalId,
        userId: userIdA,
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: new Date(),
      });
    });

    it('allows branch-scoped user to link HPR for own-branch user', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue({
        hospitalId,
        userId: userIdA,
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.PENDING,
        linkedAt: new Date(),
      });

      await service.linkHpr(branchUser, userIdA, { hprId: validHprId });

      expect(prisma.abdmProfessionalLink.upsert).toHaveBeenCalled();
    });

    it('denies branch-scoped user linking HPR for another-branch user', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await expect(
        service.linkHpr(branchUser, userIdB, { hprId: validHprId }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmProfessionalLink.upsert).not.toHaveBeenCalled();
    });
  });

  describe('syncHpr', () => {
    it('allows branch-scoped user to sync own-branch user HPR in mock mode', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchA);
      prisma.abdmProfessionalLink.findUnique
        .mockResolvedValueOnce({
          id: 'link-1',
          hprId: validHprId,
          linkedAt: new Date(),
        })
        .mockResolvedValueOnce({
          hospitalId,
          userId: userIdA,
          hprId: validHprId,
          linkStatus: AbdmRegistrationStatus.REGISTERED,
          linkedAt: new Date(),
        });
      prisma.abdmProfessionalLink.update.mockResolvedValue({
        id: 'link-1',
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.REGISTERED,
        linkedAt: new Date(),
      });

      await service.syncHpr(branchUser, userIdA);

      expect(prisma.abdmProfessionalLink.update).toHaveBeenCalled();
    });

    it('denies branch-scoped user syncing another-branch user HPR', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);

      await expect(service.syncHpr(branchUser, userIdB)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.abdmProfessionalLink.findUnique).not.toHaveBeenCalled();
    });

    it('allows hospital-wide user to sync another-branch user HPR in mock mode', async () => {
      prisma.user.findUnique.mockResolvedValue(userBranchB);
      prisma.abdmProfessionalLink.findUnique
        .mockResolvedValueOnce({
          id: 'link-b',
          hprId: validHprId,
          linkedAt: new Date(),
        })
        .mockResolvedValueOnce({
          hospitalId,
          userId: userIdB,
          hprId: validHprId,
          linkStatus: AbdmRegistrationStatus.REGISTERED,
          linkedAt: new Date(),
        });
      prisma.abdmProfessionalLink.update.mockResolvedValue({
        id: 'link-b',
        hprId: validHprId,
        linkStatus: AbdmRegistrationStatus.REGISTERED,
        linkedAt: new Date(),
      });

      await service.syncHpr(hospitalWideUser, userIdB);

      expect(prisma.abdmProfessionalLink.update).toHaveBeenCalled();
    });

    it('preserves non-mock sync unavailability after branch check', async () => {
      environmentService.isMockMode.mockReturnValue(false);
      prisma.user.findUnique.mockResolvedValue(userBranchA);
      prisma.abdmProfessionalLink.findUnique.mockResolvedValue({
        id: 'link-1',
        hprId: validHprId,
        linkedAt: new Date(),
      });

      await expect(service.syncHpr(branchUser, userIdA)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
