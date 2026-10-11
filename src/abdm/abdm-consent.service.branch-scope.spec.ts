import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AbdmConsentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { AbdmConsentService } from './abdm-consent.service';

describe('AbdmConsentService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientIdA = 'patient-a';
  const patientIdB = 'patient-b';
  const consentIdA = 'consent-a';
  const consentIdB = 'consent-b';

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

  const patientBranchA = {
    id: patientIdA,
    hospitalId,
    branchId: branchA,
  };

  const patientBranchB = {
    id: patientIdB,
    hospitalId,
    branchId: branchB,
  };

  const consentBranchA = {
    id: consentIdA,
    hospitalId,
    branchId: branchA,
    patientId: patientIdA,
    purpose: 'Care',
    hiTypes: ['Prescription'],
    status: AbdmConsentStatus.REQUESTED,
    requestedByUserId: branchUser.sub,
    consentRequestId: 'req-1',
    grantedAt: null,
    deniedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokeReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const consentBranchB = {
    ...consentBranchA,
    id: consentIdB,
    branchId: branchB,
    patientId: patientIdB,
  };

  let prisma: {
    patient: { findUnique: jest.Mock };
    abdmConsent: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let consentAuditService: { log: jest.Mock; findByConsentId: jest.Mock };
  let consentManagerService: { createConsentRequest: jest.Mock };
  let service: AbdmConsentService;

  beforeEach(() => {
    prisma = {
      patient: { findUnique: jest.fn() },
      abdmConsent: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
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
      },
      $transaction: jest.fn((ops) => {
        if (Array.isArray(ops)) {
          return Promise.all(ops.map((op) => op));
        }
        return ops(prisma);
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    consentAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
      findByConsentId: jest.fn().mockResolvedValue([]),
    };
    consentManagerService = {
      createConsentRequest: jest.fn().mockResolvedValue({
        consentRequestId: 'external-req',
      }),
    };
    const environmentService = { isMockMode: jest.fn().mockReturnValue(true) };
    service = new AbdmConsentService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      consentAuditService as unknown as AbdmConsentAuditService,
      consentManagerService as unknown as AbdmConsentManagerService,
      environmentService as never,
    );
  });

  describe('getConsent', () => {
    it('allows branch user to read own-branch consent', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchA);

      const result = await service.getConsent(branchUser, consentIdA);

      expect(result.id).toBe(consentIdA);
    });

    it('denies cross-branch consent read', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchB);

      await expect(service.getConsent(branchUser, consentIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows hospital-wide user to read cross-branch consent', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchB);

      const result = await service.getConsent(hospitalWideUser, consentIdB);

      expect(result.id).toBe(consentIdB);
    });
  });

  describe('listConsents', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.abdmConsent.findMany.mockResolvedValue([]);
    });

    it('scopes list to JWT branch for branch user', async () => {
      await service.listConsents(branchUser, patientIdA, {});

      const where = prisma.abdmConsent.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to list without branch filter', async () => {
      await service.listConsents(hospitalWideUser, patientIdA, {});

      const where = prisma.abdmConsent.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });

    it('denies listing when patient is in another branch', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(
        service.listConsents(branchUser, patientIdB, {}),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmConsent.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createConsent', () => {
    const createDto = {
      purpose: 'Treatment',
      hiTypes: ['Prescription'],
      status: AbdmConsentStatus.DRAFT,
    };

    beforeEach(() => {
      prisma.abdmConsent.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-consent', ...data }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);

      await service.createConsent(branchUser, patientIdA, {
        ...createDto,
        branchId: branchB,
      });

      expect(prisma.abdmConsent.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies create for cross-branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(
        service.createConsent(branchUser, patientIdB, createDto),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmConsent.create).not.toHaveBeenCalled();
    });

    it('preserves hospital-wide branch selection from DTO', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);

      await service.createConsent(hospitalWideUser, patientIdA, {
        ...createDto,
        branchId: branchB,
      });

      expect(prisma.abdmConsent.create.mock.calls[0][0].data.branchId).toBe(
        branchB,
      );
    });
  });

  describe('findActiveConsent', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchA);
      prisma.abdmConsent.findFirst.mockResolvedValue(null);
    });

    it('applies JWT branch scope for branch user', async () => {
      await service.findActiveConsent(branchUser, patientIdA, 'Care');

      expect(prisma.abdmConsent.findFirst.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('blocks cross-branch patient lookup', async () => {
      prisma.patient.findUnique.mockResolvedValue(patientBranchB);

      await expect(
        service.findActiveConsent(branchUser, patientIdB, 'Care'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateConsentStatus', () => {
    it('allows same-branch status mutation', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchA);
      prisma.abdmConsent.update.mockResolvedValue({
        ...consentBranchA,
        status: AbdmConsentStatus.GRANTED,
      });

      const result = await service.updateConsentStatus(branchUser, consentIdA, {
        status: AbdmConsentStatus.GRANTED,
      });

      expect(result.status).toBe(AbdmConsentStatus.GRANTED);
    });

    it('denies cross-branch status mutation', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchB);

      await expect(
        service.updateConsentStatus(branchUser, consentIdB, {
          status: AbdmConsentStatus.GRANTED,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.abdmConsent.update).not.toHaveBeenCalled();
    });
  });

  describe('getConsentAuditLog', () => {
    it('denies cross-branch audit log access', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue(consentBranchB);

      await expect(
        service.getConsentAuditLog(branchUser, consentIdB),
      ).rejects.toThrow(ForbiddenException);

      expect(consentAuditService.findByConsentId).not.toHaveBeenCalled();
    });
  });

  describe('cross-hospital', () => {
    it('denies consent read from another hospital', async () => {
      prisma.abdmConsent.findUnique.mockResolvedValue({
        ...consentBranchA,
        hospitalId: otherHospitalId,
      });

      await expect(service.getConsent(branchUser, consentIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
