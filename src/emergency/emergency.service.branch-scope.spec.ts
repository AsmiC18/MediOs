import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  EmergencyPriority,
  EmergencyVisitStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmergencyService } from './emergency.service';

describe('EmergencyService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'patient-1';
  const visitIdA = 'visit-a';
  const visitIdB = 'visit-b';

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
    emergencyVisit: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    clinicalEncounter: { create: jest.Mock; update: jest.Mock };
    triageRecord: { create: jest.Mock; update: jest.Mock };
    patient: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    branch: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: EmergencyService;

  const baseVisit = {
    id: visitIdA,
    hospitalId,
    branchId: branchA,
    patientId,
    encounterId: 'encounter-1',
    arrivalAt: new Date(),
    status: EmergencyVisitStatus.ARRIVED,
    priority: EmergencyPriority.URGENT,
    chiefComplaint: 'Chest pain',
    notes: null,
    disposition: null,
    treatmentStartedAt: null,
    dispositionAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: {},
    branch: {},
    encounter: {},
    triageRecords: [],
  };

  beforeEach(() => {
    prisma = {
      emergencyVisit: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      clinicalEncounter: {
        create: jest.fn().mockResolvedValue({ id: 'encounter-1' }),
        update: jest.fn(),
      },
      triageRecord: {
        create: jest.fn(),
        update: jest.fn(),
      },
      patient: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback) =>
        callback({
          clinicalEncounter: prisma.clinicalEncounter,
          emergencyVisit: prisma.emergencyVisit,
          triageRecord: prisma.triageRecord,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const domainEventOutboxService = {
      createInTransaction: jest.fn(),
      enqueueDispatchInTransaction: jest.fn(),
    };
    service = new EmergencyService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      domainEventOutboxService as never,
      { notifyEscalation: jest.fn().mockResolvedValue(0) } as never,
      { enqueueAfterCommit: jest.fn() } as never,
    );
  });

  describe('listVisits', () => {
    it('scopes branch user list to JWT branch and ignores query branchId', async () => {
      await service.listVisits(branchUser, { branchId: branchB });

      const where = prisma.emergencyVisit.findMany.mock.calls[0][0].where;
      expect(where.hospitalId).toBe(hospitalId);
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to filter by branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      await service.listVisits(hospitalWideUser, { branchId: branchB });

      const where = prisma.emergencyVisit.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchB);
    });

    it('allows hospital-wide user to list all branches', async () => {
      await service.listVisits(hospitalWideUser, {});

      const where = prisma.emergencyVisit.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getVisit', () => {
    it('allows branch user to get same-branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue(baseVisit);

      const visit = await service.getVisit(branchUser, visitIdA);

      expect(visit.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        id: visitIdB,
        branchId: branchB,
      });

      await expect(service.getVisit(branchUser, visitIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital isolation as not found', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue(null);

      await expect(service.getVisit(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createVisit', () => {
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
      prisma.emergencyVisit.create.mockImplementation(({ data, include }) =>
        Promise.resolve({
          id: visitIdA,
          ...data,
          arrivalAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          patient: {},
          branch: {},
          encounter: {},
          triageRecords: [],
          ...(include ? {} : {}),
        }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchA, hospitalId });

      const visit = await service.createVisit(branchUser, {
        patientId,
        chiefComplaint: 'Fall',
        priority: EmergencyPriority.ROUTINE,
        branchId: branchB,
      });

      expect(visit.branchId).toBe(branchA);
      expect(
        prisma.clinicalEncounter.create.mock.calls[0][0].data.branchId,
      ).toBe(branchA);
      expect(prisma.emergencyVisit.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('allows hospital-wide user to create visit in chosen branch', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: branchB, hospitalId });

      const visit = await service.createVisit(hospitalWideUser, {
        patientId,
        chiefComplaint: 'Fall',
        priority: EmergencyPriority.ROUTINE,
        branchId: branchB,
      });

      expect(visit.branchId).toBe(branchB);
    });
  });

  describe('mutations', () => {
    it('denies branch user triage on another branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        id: visitIdB,
        branchId: branchB,
      });

      await expect(
        service.createTriage(branchUser, visitIdB, {
          priority: EmergencyPriority.URGENT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows branch user triage on own-branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue(baseVisit);
      prisma.user.findUnique.mockResolvedValue({
        id: branchUser.sub,
        hospitalId,
      });
      prisma.triageRecord.create.mockResolvedValue({
        id: 'triage-1',
        emergencyVisitId: visitIdA,
        priority: EmergencyPriority.URGENT,
        assessedAt: new Date(),
        assessedBy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.emergencyVisit.update.mockResolvedValue({
        ...baseVisit,
        status: EmergencyVisitStatus.TRIAGED,
        triageRecords: [],
      });

      const result = await service.createTriage(branchUser, visitIdA, {
        priority: EmergencyPriority.URGENT,
        heartRate: 80,
      });

      expect(result.visit.status).toBe(EmergencyVisitStatus.TRIAGED);
    });

    it('denies branch user starting treatment on another branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        id: visitIdB,
        branchId: branchB,
        status: EmergencyVisitStatus.TRIAGED,
        triageRecords: [{ id: 'triage-1' }],
      });

      await expect(
        service.startTreatment(branchUser, visitIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves treatment business rule for authorized branch user', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        status: EmergencyVisitStatus.ARRIVED,
        triageRecords: [],
      });

      await expect(
        service.startTreatment(branchUser, visitIdA),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies branch user cancelling another branch visit', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        id: visitIdB,
        branchId: branchB,
      });

      await expect(service.cancelVisit(branchUser, visitIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies branch user reading triage history for another branch', async () => {
      prisma.emergencyVisit.findUnique.mockResolvedValue({
        ...baseVisit,
        id: visitIdB,
        branchId: branchB,
        triageRecords: [],
      });

      await expect(
        service.getTriageHistory(branchUser, visitIdB),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
