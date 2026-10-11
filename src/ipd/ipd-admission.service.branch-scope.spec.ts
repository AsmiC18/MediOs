import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, IpdAdmissionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { IpdAdmissionService } from './ipd-admission.service';

describe('IpdAdmissionService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'patient-1';
  const admissionIdA = 'admission-a';
  const admissionIdB = 'admission-b';
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
    ipdAdmission: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    ipdBed: { findUnique: jest.Mock };
    ipdBedAssignment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    patient: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: IpdAdmissionService;

  const admittedAdmissionA = {
    id: admissionIdA,
    hospitalId,
    branchId: branchA,
    patientId,
    admissionNumber: 'ADM-000001',
    status: IpdAdmissionStatus.ADMITTED,
    admissionDate: new Date(),
    dischargeDate: null,
    reason: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: {},
    branch: {},
    assignments: [],
  };

  beforeEach(() => {
    prisma = {
      ipdAdmission: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      ipdBed: { findUnique: jest.fn() },
      ipdBedAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      patient: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) => {
        const txAdmission = {
          ...prisma.ipdAdmission,
          findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
            const createdData =
              prisma.ipdAdmission.create.mock.calls.at(-1)?.[0]?.data;
            return Promise.resolve({
              ...admittedAdmissionA,
              id: where.id,
              branchId: createdData?.branchId ?? admittedAdmissionA.branchId,
            });
          }),
        };

        return callback({
          ipdAdmission: txAdmission,
          ipdBed: prisma.ipdBed,
          ipdBedAssignment: prisma.ipdBedAssignment,
          $executeRaw: jest.fn(),
        });
      }),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new IpdAdmissionService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      { enqueueAfterCommit: jest.fn() } as never,
    );
  });

  describe('listAdmissions', () => {
    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.listAdmissions(branchUser, { branchId: branchB });

      const where = prisma.ipdAdmission.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listAdmissions(hospitalWideUser, { branchId: branchB });

      const where = prisma.ipdAdmission.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.listAdmissions(hospitalWideUser, {});

      const where = prisma.ipdAdmission.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getAdmission', () => {
    it('allows branch user to get same-branch admission', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue(admittedAdmissionA);

      const admission = await service.getAdmission(branchUser, admissionIdA);

      expect(admission.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch admission', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        id: admissionIdB,
        branchId: branchB,
      });

      await expect(
        service.getAdmission(branchUser, admissionIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('keeps cross-hospital isolation as not found', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue(null);

      await expect(
        service.getAdmission(branchUser, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAdmission', () => {
    beforeEach(() => {
      prisma.patient.findUnique.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });
      prisma.ipdAdmission.findFirst.mockResolvedValue(null);
      prisma.ipdAdmission.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: admissionIdA, ...data }),
      );
      prisma.ipdAdmission.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({
          ...admittedAdmissionA,
          id: where.id,
        }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      const admission = await service.createAdmission(branchUser, {
        patientId,
        branchId: branchB,
      });

      expect(admission.branchId).toBe(branchA);
      expect(prisma.ipdAdmission.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies branch user initial bed allocation in another branch', async () => {
      prisma.ipdBed.findUnique.mockResolvedValue({
        id: bedIdB,
        hospitalId,
        branchId: branchB,
        status: BedStatus.AVAILABLE,
      });

      await expect(
        service.createAdmission(branchUser, {
          patientId,
          branchId: branchB,
          bedId: bedIdB,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows hospital-wide user to create admission in chosen branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      const admission = await service.createAdmission(hospitalWideUser, {
        patientId,
        branchId: branchB,
      });

      expect(admission.branchId).toBe(branchB);
    });
  });

  describe('allocateBed, transferBed, discharge', () => {
    it('denies branch user allocating bed on another branch admission', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        id: admissionIdB,
        branchId: branchB,
      });

      await expect(
        service.allocateBed(branchUser, admissionIdB, { bedId: bedIdB }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user discharging another branch admission', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        id: admissionIdB,
        branchId: branchB,
      });

      await expect(
        service.discharge(branchUser, admissionIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves discharge business rule for same-branch user', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        status: IpdAdmissionStatus.DISCHARGED,
      });

      await expect(service.discharge(branchUser, admissionIdA)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('denies branch user transfer on another branch admission', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        id: admissionIdB,
        branchId: branchB,
        assignments: [
          {
            id: 'assign-1',
            bedId: bedIdB,
            releasedAt: null,
            bed: { branchId: branchB },
          },
        ],
      });

      await expect(
        service.transferBed(branchUser, admissionIdB, { newBedId: bedIdA }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cross-branch bed transfer via existing same-branch bed rule', async () => {
      prisma.ipdAdmission.findUnique.mockResolvedValue({
        ...admittedAdmissionA,
        assignments: [
          {
            id: 'assign-a',
            bedId: bedIdA,
            releasedAt: null,
            bed: { branchId: branchA },
          },
        ],
      });
      prisma.ipdBed.findUnique.mockResolvedValue({
        id: bedIdB,
        hospitalId,
        branchId: branchB,
        status: BedStatus.AVAILABLE,
      });

      await expect(
        service.transferBed(branchUser, admissionIdA, { newBedId: bedIdB }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
