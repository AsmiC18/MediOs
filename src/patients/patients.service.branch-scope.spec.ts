import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PatientsService } from './patients.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('PatientsService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';

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
    patient: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
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
        create: jest.fn(),
        update: jest.fn(),
      },
      patientFieldHistory: { create: jest.fn().mockResolvedValue({}) },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn((ops) => {
        if (Array.isArray(ops)) {
          return Promise.all(ops.map((op) => op));
        }
        return ops({
          patient: prisma.patient,
          patientFieldHistory: prisma.patientFieldHistory,
        });
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    preferenceService = {
      isWhatsAppTransactionalEnabled: jest.fn().mockResolvedValue(true),
      upsertWhatsAppTransactionalEnabled: jest.fn(),
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

  describe('findAll', () => {
    beforeEach(() => {
      prisma.patient.count.mockResolvedValue(0);
      prisma.patient.findMany.mockResolvedValue([]);
    });

    it('restricts branch-scoped user to JWT branch regardless of query branchId', async () => {
      await service.findAll(branchUser, { branchId: branchB });

      const where = prisma.patient.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
      expect(where.branchId).not.toBe(branchB);
    });

    it('lists only Branch A patients for branch-scoped user', async () => {
      prisma.patient.findMany.mockResolvedValue([
        { id: 'p1', hospitalId, branchId: branchA },
      ]);
      prisma.patient.count.mockResolvedValue(1);

      const result = await service.findAll(branchUser, {});

      expect(result.data).toHaveLength(1);
      expect(prisma.patient.findMany.mock.calls[0][0].where.branchId).toBe(
        branchA,
      );
    });

    it('preserves hospital-wide listing with optional branch filter', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchB,
        hospitalId,
      });

      await service.findAll(hospitalWideUser, { branchId: branchB });

      const where = prisma.patient.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
      expect(prisma.branch.findUnique).toHaveBeenCalled();
    });

    it('preserves hospital-wide listing without branch filter', async () => {
      await service.findAll(hospitalWideUser, {});

      const where = prisma.patient.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });

    it('uses list select without clinical fields', async () => {
      await service.findAll(hospitalWideUser, {});

      const select = prisma.patient.findMany.mock.calls[0][0].select;
      expect(select.abhaId).toBeUndefined();
      expect(select.allergies).toBeUndefined();
      expect(select.id).toBe(true);
    });
  });

  describe('findOne', () => {
    it('allows branch-scoped user to read same-branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'patient-a',
        hospitalId,
        branchId: branchA,
        mergedIntoPatientId: null,
      });

      const patient = await service.findOne(branchUser, 'patient-a');

      expect(patient.branchId).toBe(branchA);
    });

    it('denies branch-scoped user reading another branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'patient-b',
        hospitalId,
        branchId: branchB,
        mergedIntoPatientId: null,
      });

      await expect(service.findOne(branchUser, 'patient-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows hospital-wide user to read any branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'patient-b',
        hospitalId,
        branchId: branchB,
        mergedIntoPatientId: null,
      });

      const patient = await service.findOne(hospitalWideUser, 'patient-b');

      expect(patient.id).toBe('patient-b');
    });

    it('keeps cross-hospital isolation as not found', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: 'other-hospital-patient',
        hospitalId: otherHospitalId,
        branchId: branchA,
        mergedIntoPatientId: null,
      });

      await expect(
        service.findOne(branchUser, 'other-hospital-patient'),
      ).rejects.toThrow(new NotFoundException('Patient not found'));
    });
  });

  describe('create', () => {
    const baseDto = {
      phone: '9876543210',
      firstName: 'Branch',
      lastName: 'Test',
    };

    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue(null);
      prisma.branch.findUnique.mockResolvedValue({
        id: branchA,
        hospitalId,
      });
      prisma.patient.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'new-patient',
          ...data,
          allergies: [],
          chronicConditions: [],
          emergencyContacts: null,
        }),
      );
    });

    it('forces branch-scoped user creates into JWT branch', async () => {
      const patient = await service.create(branchUser, {
        ...baseDto,
        branchId: branchB,
      });

      expect(patient.branchId).toBe(branchA);
      expect(prisma.patient.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('preserves hospital-wide create branch selection', async () => {
      prisma.branch.findUnique.mockResolvedValue({
        id: branchB,
        hospitalId,
      });

      const patient = await service.create(hospitalWideUser, {
        ...baseDto,
        branchId: branchB,
      });

      expect(patient.branchId).toBe(branchB);
    });
  });

  describe('update', () => {
    const activePatient = {
      id: 'patient-a',
      hospitalId,
      branchId: branchA,
      mergedIntoPatientId: null,
      allergies: [],
      chronicConditions: [],
      emergencyContacts: null,
      phone: '+919876543210',
    };

    beforeEach(() => {
      prisma.patient.update.mockImplementation(({ data }) =>
        Promise.resolve({
          ...activePatient,
          ...data,
        }),
      );
    });

    it('denies branch-scoped user updating another branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        ...activePatient,
        id: 'patient-b',
        branchId: branchB,
      });

      await expect(
        service.update(branchUser, 'patient-b', { firstName: 'Nope' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch-scoped user moving patient to another branch', async () => {
      prisma.patient.findUnique.mockResolvedValue(activePatient);

      await expect(
        service.update(branchUser, 'patient-a', { branchId: branchB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows branch-scoped user updating same-branch patient', async () => {
      prisma.patient.findUnique.mockResolvedValue(activePatient);

      const updated = await service.update(branchUser, 'patient-a', {
        firstName: 'Updated',
      });

      expect(updated.firstName).toBe('Updated');
    });

    it('preserves hospital-wide branch updates with validation', async () => {
      prisma.patient.findUnique.mockResolvedValue(activePatient);
      prisma.branch.findUnique.mockResolvedValue({
        id: branchB,
        hospitalId,
      });

      const updated = await service.update(hospitalWideUser, 'patient-a', {
        branchId: branchB,
      });

      expect(updated.branchId).toBe(branchB);
      expect(prisma.branch.findUnique).toHaveBeenCalled();
    });
  });
});
