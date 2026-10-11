import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PatientsService } from './patients.service';
import { PATIENT_LIST_SELECT } from './patient-list.types';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('PatientsService notification preferences (J4)', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const readUser = { sub: 'user-1', hospitalId, branchId: branchA };
  const updateUser = { sub: 'user-2', hospitalId, branchId: null as string | null };

  let prisma: {
    patient: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    patientFieldHistory: { create: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let preferenceService: {
    isWhatsAppTransactionalEnabled: jest.Mock;
    upsertWhatsAppTransactionalEnabled: jest.Mock;
  };
  let service: PatientsService;

  beforeEach(() => {
    prisma = {
      patient: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      patientFieldHistory: { create: jest.fn() },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn((ops) => {
        if (Array.isArray(ops)) {
          return Promise.all(ops.map((op) => op));
        }
        return ops(prisma);
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    preferenceService = {
      isWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue(true),
      upsertWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue({}),
    };
    service = new PatientsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      preferenceService as never,
      {
        syncFromAtRiskEvaluation: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  function mockPatient(overrides: Record<string, unknown> = {}) {
    prisma.patient.findUnique.mockResolvedValue({
      id: 'patient-1',
      hospitalId,
      branchId: branchA,
      mergedIntoPatientId: null,
      ...overrides,
    });
  }

  it('GET returns default-enabled when no preference row', async () => {
    mockPatient();
    const result = await service.getNotificationPreferences(readUser, 'patient-1');
    expect(result).toEqual({ whatsappTransactionalEnabled: true });
    expect(preferenceService.isWhatsAppTransactionalEnabled).toHaveBeenCalledWith(
      hospitalId,
      'patient-1',
    );
  });

  it('PATCH updates preference and audits change', async () => {
    mockPatient();
    preferenceService.isWhatsAppTransactionalEnabled.mockResolvedValue(true);

    const result = await service.updateNotificationPreferences(readUser, 'patient-1', {
      whatsappTransactionalEnabled: false,
    });

    expect(result).toEqual({ whatsappTransactionalEnabled: false });
    expect(preferenceService.upsertWhatsAppTransactionalEnabled).toHaveBeenCalledWith(
      hospitalId,
      'patient-1',
      false,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATIENT_NOTIFICATION_PREFERENCE_UPDATED',
        metadata: expect.objectContaining({
          field: 'whatsappTransactionalEnabled',
          previousEnabled: true,
          enabled: false,
        }),
      }),
    );
  });

  it('PATCH is idempotent when value unchanged', async () => {
    mockPatient();
    preferenceService.isWhatsAppTransactionalEnabled.mockResolvedValue(false);

    await service.updateNotificationPreferences(readUser, 'patient-1', {
      whatsappTransactionalEnabled: false,
    });

    expect(preferenceService.upsertWhatsAppTransactionalEnabled).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('denies cross-branch access for branch-scoped user', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      id: 'patient-b',
      hospitalId,
      branchId: branchB,
      mergedIntoPatientId: null,
    });

    await expect(
      service.getNotificationPreferences(readUser, 'patient-b'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies cross-hospital access', async () => {
    prisma.patient.findUnique.mockResolvedValue({
      id: 'other',
      hospitalId: '99999999-9999-4999-8999-999999999999',
      branchId: branchA,
      mergedIntoPatientId: null,
    });

    await expect(
      service.getNotificationPreferences(readUser, 'other'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findAll uses minimized list select', async () => {
    prisma.patient.count.mockResolvedValue(0);
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((ops) => Promise.all(ops));

    await service.findAll(updateUser, {});

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: PATIENT_LIST_SELECT }),
    );
  });
});
