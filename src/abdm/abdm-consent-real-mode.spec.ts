import { ServiceUnavailableException } from '@nestjs/common';
import { AbdmConsentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { AbdmConsentService } from './abdm-consent.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { isExternalConsentManagerTransition } from './abdm-consent-real-mode.util';

describe('AbdmConsent real-mode safety', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const patientId = 'patient-1';
  const user = { sub: 'user-1', hospitalId, branchId: null as string | null };

  let prisma: {
    patient: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    abdmConsent: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let consentManagerService: { createConsentRequest: jest.Mock };
  let environmentService: { isMockMode: jest.Mock };
  let service: AbdmConsentService;

  beforeEach(() => {
    prisma = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: patientId,
          hospitalId,
          branchId: null,
        }),
      },
      branch: { findUnique: jest.fn() },
      abdmConsent: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    consentManagerService = {
      createConsentRequest: jest.fn().mockResolvedValue({
        consentRequestId: 'mock-req',
      }),
    };
    environmentService = { isMockMode: jest.fn().mockReturnValue(false) };
    service = new AbdmConsentService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      { log: jest.fn(), findByConsentId: jest.fn() } as unknown as AbdmConsentAuditService,
      consentManagerService as unknown as AbdmConsentManagerService,
      environmentService as unknown as AbdmEnvironmentService,
    );
  });

  it('blocks create with REQUESTED in real mode', async () => {
    await expect(
      service.createConsent(user, patientId, {
        purpose: 'Care',
        hiTypes: ['Prescription'],
        status: AbdmConsentStatus.REQUESTED,
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(consentManagerService.createConsentRequest).not.toHaveBeenCalled();
    expect(prisma.abdmConsent.create).not.toHaveBeenCalled();
  });

  it('allows create DRAFT in real mode', async () => {
    prisma.abdmConsent.create.mockResolvedValue({
      id: 'consent-1',
      status: AbdmConsentStatus.DRAFT,
    });

    await service.createConsent(user, patientId, {
      purpose: 'Care',
      hiTypes: ['Prescription'],
      status: AbdmConsentStatus.DRAFT,
    });

    expect(prisma.abdmConsent.create).toHaveBeenCalled();
    expect(consentManagerService.createConsentRequest).not.toHaveBeenCalled();
  });

  it('blocks PATCH to GRANTED in real mode', async () => {
    const consent = {
      id: 'consent-1',
      hospitalId,
      branchId: null,
      patientId,
      status: AbdmConsentStatus.REQUESTED,
      purpose: 'Care',
      hiTypes: [],
      requestedByUserId: user.sub,
      consentRequestId: null,
      expiresAt: null,
      grantedAt: null,
      deniedAt: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.abdmConsent.findUnique.mockResolvedValue(consent);

    await expect(
      service.updateConsentStatus(user, consent.id, {
        status: AbdmConsentStatus.GRANTED,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('classifies external CM transitions', () => {
    expect(
      isExternalConsentManagerTransition(
        AbdmConsentStatus.DRAFT,
        AbdmConsentStatus.REQUESTED,
      ),
    ).toBe(true);
    expect(
      isExternalConsentManagerTransition(
        AbdmConsentStatus.REQUESTED,
        AbdmConsentStatus.EXPIRED,
      ),
    ).toBe(false);
    expect(
      isExternalConsentManagerTransition(
        AbdmConsentStatus.DRAFT,
        AbdmConsentStatus.DENIED,
      ),
    ).toBe(false);
  });
});

describe('AbdmConsent mock mode create', () => {
  it('still creates REQUESTED with synthetic id in mock mode', async () => {
    const hospitalId = '11111111-1111-4111-8111-111111111111';
    const patientId = 'patient-1';
    const user = { sub: 'user-1', hospitalId, branchId: null as string | null };

    const prisma = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: patientId,
          hospitalId,
          branchId: null,
        }),
      },
      branch: { findUnique: jest.fn() },
      abdmConsent: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'c1', ...data }),
        ),
      },
    };
    const consentManagerService = {
      createConsentRequest: jest.fn().mockResolvedValue({
        consentRequestId: 'mock-external',
      }),
    };
    const environmentService = { isMockMode: jest.fn().mockReturnValue(true) };
    const service = new AbdmConsentService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
      { log: jest.fn() } as unknown as AbdmConsentAuditService,
      consentManagerService as unknown as AbdmConsentManagerService,
      environmentService as unknown as AbdmEnvironmentService,
    );

    await service.createConsent(user, patientId, {
      purpose: 'Care',
      hiTypes: ['Prescription'],
      status: AbdmConsentStatus.REQUESTED,
    });

    expect(consentManagerService.createConsentRequest).toHaveBeenCalled();
    expect(prisma.abdmConsent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consentRequestId: 'mock-external',
          status: AbdmConsentStatus.REQUESTED,
        }),
      }),
    );
  });
});
