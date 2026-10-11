import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  IpdAdmissionStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClinicalService } from './clinical.service';
import { Icd10Service } from './icd10/icd10.service';

describe('ClinicalService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherHospitalId = '99999999-9999-4999-8999-999999999999';
  const patientId = 'patient-1';
  const appointmentId = 'appointment-1';

  const branchUser = {
    sub: 'provider-a',
    hospitalId,
    branchId: branchA,
    roleId: 'role-a',
  };

  const hospitalWideUser = {
    sub: 'provider-hospital',
    hospitalId,
    branchId: null as string | null,
    roleId: 'role-h',
  };

  let prisma: {
    clinicalEncounter: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    patient: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    appointment: { findUnique: jest.Mock };
    ipdAdmission: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    clinicalDiagnosis: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    prescription: { findUnique: jest.Mock; update: jest.Mock };
    clinicalSoapNote: { findUnique: jest.Mock };
  };
  let auditService: { log: jest.Mock; logInTransaction: jest.Mock };
  let prescriptionSafetyService: {
    evaluateForPrescription: jest.Mock;
    assertCanPersist: jest.Mock;
    userHasSafetyOverridePermission: jest.Mock;
    getEvaluatorVersion: jest.Mock;
  };
  let service: ClinicalService;

  const encounterPayload = {
    patient: { allergies: [] },
    provider: {},
    appointment: {},
    ipdAdmission: null,
    soapNote: null,
    diagnoses: [],
    prescriptions: [],
  };

  beforeEach(() => {
    prisma = {
      clinicalEncounter: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      patient: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      appointment: { findUnique: jest.fn() },
      ipdAdmission: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      clinicalDiagnosis: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      prescription: { findUnique: jest.fn(), update: jest.fn() },
      clinicalSoapNote: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    prescriptionSafetyService = {
      evaluateForPrescription: jest.fn(),
      assertCanPersist: jest.fn(),
      userHasSafetyOverridePermission: jest.fn(),
      getEvaluatorVersion: jest.fn().mockReturnValue('c1.0.0'),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );

    service = new ClinicalService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      prescriptionSafetyService as never,
      {
        emitPrescriptionCreatedInTransaction: jest.fn(),
        emitPrescriptionStatusChangedInTransaction: jest.fn(),
      } as never,
      {
        validateActiveCode: jest.fn(),
      } as unknown as Icd10Service,
    );
  });

  describe('listEncounters', () => {
    beforeEach(() => {
      prisma.clinicalEncounter.findMany.mockResolvedValue([]);
    });

    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.listEncounters(branchUser, undefined, branchB);

      const where = prisma.clinicalEncounter.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listEncounters(hospitalWideUser, undefined, branchB);

      const where = prisma.clinicalEncounter.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.listEncounters(hospitalWideUser);

      const where = prisma.clinicalEncounter.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getEncounter', () => {
    it('allows branch user to get same-branch encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'enc-a',
        hospitalId,
        branchId: branchA,
        status: ClinicalEncounterStatus.OPEN,
        ...encounterPayload,
      });

      const encounter = await service.getEncounter(branchUser, 'enc-a');

      expect(encounter.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'enc-b',
        hospitalId,
        branchId: branchB,
        status: ClinicalEncounterStatus.OPEN,
        ...encounterPayload,
      });

      await expect(service.getEncounter(branchUser, 'enc-b')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        id: 'enc-other',
        hospitalId: otherHospitalId,
        branchId: branchA,
        status: ClinicalEncounterStatus.OPEN,
        ...encounterPayload,
      });

      await expect(
        service.getEncounter(branchUser, 'enc-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createEncounter', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: branchUser.sub,
        hospitalId,
      });
      prisma.clinicalEncounter.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'enc-new',
          ...data,
          ...encounterPayload,
        }),
      );
    });

    it('denies branch user creating encounter from another branch appointment', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        patientId,
        branchId: branchB,
      });

      await expect(
        service.createEncounter(branchUser, {
          patientId,
          appointmentId,
          encounterType: ClinicalEncounterType.OPD,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.clinicalEncounter.create).not.toHaveBeenCalled();
    });

    it('creates encounter in JWT branch for branch-scoped user', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        patientId,
        branchId: branchA,
      });

      const encounter = await service.createEncounter(branchUser, {
        patientId,
        appointmentId,
        encounterType: ClinicalEncounterType.OPD,
      });

      expect(encounter.branchId).toBe(branchA);
      expect(prisma.clinicalEncounter.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('preserves hospital-wide branch from appointment context', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: hospitalWideUser.sub,
        hospitalId,
      });
      prisma.appointment.findUnique.mockResolvedValue({
        id: appointmentId,
        hospitalId,
        patientId,
        branchId: branchB,
      });

      const encounter = await service.createEncounter(hospitalWideUser, {
        patientId,
        appointmentId,
        encounterType: ClinicalEncounterType.OPD,
      });

      expect(encounter.branchId).toBe(branchB);
    });
  });

  describe('mutations via encounter ownership', () => {
    const openEncounter = {
      id: 'enc-a',
      hospitalId,
      branchId: branchA,
      patientId,
      status: ClinicalEncounterStatus.OPEN,
      ...encounterPayload,
    };

    it('allows branch user to complete same-branch encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue(openEncounter);
      prisma.clinicalEncounter.update.mockResolvedValue({
        ...openEncounter,
        status: ClinicalEncounterStatus.COMPLETED,
      });

      const updated = await service.completeEncounter(branchUser, 'enc-a');

      expect(updated.status).toBe(ClinicalEncounterStatus.COMPLETED);
    });

    it('denies branch user completing another branch encounter', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        ...openEncounter,
        id: 'enc-b',
        branchId: branchB,
      });

      await expect(
        service.completeEncounter(branchUser, 'enc-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves invalid transition rules for same-branch user', async () => {
      prisma.clinicalEncounter.findUnique.mockResolvedValue({
        ...openEncounter,
        status: ClinicalEncounterStatus.COMPLETED,
      });

      await expect(
        service.completeEncounter(branchUser, 'enc-a'),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies branch user updating diagnosis on another branch encounter', async () => {
      prisma.clinicalDiagnosis.findUnique.mockResolvedValue({
        id: 'dx-1',
        hospitalId,
        encounterId: 'enc-b',
        code: 'A00.0',
        encounter: {
          branchId: branchB,
          status: ClinicalEncounterStatus.OPEN,
        },
      });

      await expect(
        service.updateDiagnosis(branchUser, 'dx-1', { description: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user updating prescription status on another branch', async () => {
      prisma.prescription.findUnique.mockResolvedValue({
        id: 'rx-1',
        hospitalId,
        status: PrescriptionStatus.ACTIVE,
        encounterId: 'enc-b',
        encounter: { branchId: branchB },
        items: [],
      });

      await expect(
        service.updatePrescriptionStatus(branchUser, 'rx-1', {
          status: PrescriptionStatus.COMPLETED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPatientClinicalRecords', () => {
    it('scopes returned encounters for branch user', async () => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.clinicalEncounter.findMany.mockResolvedValue([]);

      await service.getPatientClinicalRecords(branchUser, patientId);

      const where = prisma.clinicalEncounter.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
      expect(where.patientId).toBe(patientId);
    });
  });
});
