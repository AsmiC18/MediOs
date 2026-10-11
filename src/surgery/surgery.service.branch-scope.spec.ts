import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ResourceType,
  SurgeryRequestStatus,
  SurgeryScheduleStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppointmentsService } from '../scheduling/appointments/appointments.service';
import { SurgeryService } from './surgery.service';

describe('SurgeryService branch scope', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'patient-1';
  const encounterId = 'encounter-1';
  const requestIdA = 'request-a';
  const requestIdB = 'request-b';
  const scheduleIdB = 'schedule-b';
  const resourceId = 'resource-ot';

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
    surgeryRequest: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    surgerySchedule: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    surgeryPreOpAssessment: { create: jest.Mock };
    clinicalEncounter: { findFirst: jest.Mock };
    ipdAdmission: { findFirst: jest.Mock };
    insurancePreAuthorization: { findFirst: jest.Mock };
    patient: { findFirst: jest.Mock };
    resource: { findFirst: jest.Mock };
    branch: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let appointmentsService: { create: jest.Mock };
  let service: SurgeryService;

  const requestIncludeShape = {
    patient: {},
    encounter: {},
    admission: null,
    preAuthorization: null,
    preOpAssessment: null,
    schedule: null,
    procedureRecord: null,
    postOpRecord: null,
  };

  const baseRequest = {
    id: requestIdA,
    hospitalId,
    branchId: branchA,
    patientId,
    encounterId,
    status: SurgeryRequestStatus.REQUESTED,
    procedureName: 'Appendectomy',
    preOpAssessment: { fitnessStatus: 'FIT' },
    schedule: null,
    ...requestIncludeShape,
  };

  beforeEach(() => {
    prisma = {
      surgeryRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      surgerySchedule: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      surgeryPreOpAssessment: { create: jest.fn() },
      clinicalEncounter: { findFirst: jest.fn() },
      ipdAdmission: { findFirst: jest.fn() },
      insurancePreAuthorization: { findFirst: jest.fn() },
      patient: { findFirst: jest.fn() },
      resource: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(async (callback) =>
        callback({
          surgeryPreOpAssessment: prisma.surgeryPreOpAssessment,
          surgeryRequest: prisma.surgeryRequest,
          surgerySchedule: prisma.surgerySchedule,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    appointmentsService = { create: jest.fn() };
    service = new SurgeryService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      appointmentsService as unknown as AppointmentsService,
      {
        createInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-surgery-test' }),
        enqueueDispatchInTransaction: jest.fn().mockResolvedValue({ id: 'job-1' }),
      } as never,
      { enqueueAfterCommit: jest.fn() } as never,
    );
  });

  describe('listRequests', () => {
    it('scopes branch user list to JWT branch', async () => {
      await service.listRequests(branchUser, {});

      const where = prisma.surgeryRequest.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });

    it('allows hospital-wide user to list without branch filter', async () => {
      await service.listRequests(hospitalWideUser, {});

      const where = prisma.surgeryRequest.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });
  });

  describe('getRequest', () => {
    it('allows branch user to get own-branch request', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue(baseRequest);

      const request = await service.getRequest(branchUser, requestIdA);

      expect(request.branchId).toBe(branchA);
    });

    it('denies branch user access to another branch request', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        id: requestIdB,
        branchId: branchB,
      });

      await expect(service.getRequest(branchUser, requestIdB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps cross-hospital request as not found', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue(null);

      await expect(service.getRequest(branchUser, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createRequest', () => {
    beforeEach(() => {
      prisma.patient.findFirst.mockResolvedValue({
        id: patientId,
        hospitalId,
        mergedIntoPatientId: null,
      });
      prisma.clinicalEncounter.findFirst.mockResolvedValue({
        id: encounterId,
        hospitalId,
        patientId,
        branchId: branchA,
        status: ClinicalEncounterStatus.OPEN,
      });
      prisma.surgeryRequest.create.mockImplementation(({ data, include }) =>
        Promise.resolve({
          id: requestIdA,
          ...data,
          status: SurgeryRequestStatus.REQUESTED,
          ...requestIncludeShape,
          ...(include ? {} : {}),
        }),
      );
    });

    it('forces JWT branch for branch-scoped user', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: branchA, hospitalId });

      const request = await service.createRequest(branchUser, {
        patientId,
        encounterId,
        procedureName: 'Appendectomy',
        branchId: branchB,
      });

      expect(request.branchId).toBe(branchA);
      expect(prisma.surgeryRequest.create.mock.calls[0][0].data.branchId).toBe(
        branchA,
      );
    });

    it('denies branch user using another branch encounter', async () => {
      prisma.clinicalEncounter.findFirst.mockResolvedValue({
        id: encounterId,
        hospitalId,
        patientId,
        branchId: branchB,
        status: ClinicalEncounterStatus.OPEN,
      });

      await expect(
        service.createRequest(branchUser, {
          patientId,
          encounterId,
          procedureName: 'Appendectomy',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user linking another branch pre-authorization', async () => {
      prisma.insurancePreAuthorization.findFirst.mockResolvedValue({
        id: 'preauth-b',
        hospitalId,
        patientId,
        branchId: branchB,
      });

      await expect(
        service.createRequest(branchUser, {
          patientId,
          encounterId,
          procedureName: 'Appendectomy',
          preAuthorizationId: 'preauth-b',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('schedule and schedules', () => {
    it('denies branch user scheduling another branch request', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        id: requestIdB,
        branchId: branchB,
        status: SurgeryRequestStatus.PRE_OP,
        preOpAssessment: { fitnessStatus: 'FIT' },
      });

      await expect(
        service.scheduleRequest(branchUser, requestIdB, {
          resourceId,
          startAt: '2030-06-01T09:00:00.000Z',
          endAt: '2030-06-01T11:00:00.000Z',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies branch user getting another branch schedule', async () => {
      prisma.surgerySchedule.findFirst.mockResolvedValue({
        id: scheduleIdB,
        hospitalId,
        branchId: branchB,
        surgeryRequest: {
          branchId: branchB,
          patient: {},
        },
        resource: {},
        appointment: {},
        scheduledBy: {},
      });

      await expect(
        service.getSchedule(branchUser, scheduleIdB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scopes branch user schedule list to JWT branch', async () => {
      await service.listSchedules(branchUser, {});

      const where = prisma.surgerySchedule.findMany.mock.calls[0][0].where;
      expect(where.branchId).toBe(branchA);
    });
  });

  describe('mutations', () => {
    it('denies branch user cancelling another branch request', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        id: requestIdB,
        branchId: branchB,
        status: SurgeryRequestStatus.REQUESTED,
      });

      await expect(
        service.cancelRequest(branchUser, requestIdB, {
          cancellationReason: 'No longer needed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves business rule for authorized branch user', async () => {
      prisma.surgeryRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        preOpAssessment: { id: 'preop-1' },
      });

      await expect(
        service.recordPreOp(branchUser, requestIdA, {
          fitnessStatus: 'FIT',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
