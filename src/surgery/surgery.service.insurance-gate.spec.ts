import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  ClinicalEncounterType,
  InsurancePreAuthorizationStatus,
  ResourceType,
  SurgeryRequestStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppointmentsService } from '../scheduling/appointments/appointments.service';
import { SurgeryService } from './surgery.service';

describe('SurgeryService insurance gate', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const branchB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'patient-1';
  const otherPatientId = 'patient-2';
  const encounterId = 'encounter-1';
  const requestId = 'request-1';
  const preAuthId = 'preauth-1';
  const resourceId = 'resource-ot';
  const userId = 'user-1';

  const user = {
    sub: userId,
    hospitalId,
    branchId: branchA,
  };

  let prisma: {
    surgeryRequest: { findFirst: jest.Mock; update: jest.Mock };
    surgerySchedule: { create: jest.Mock; update: jest.Mock };
    insurancePreAuthorization: { findFirst: jest.Mock };
    branch: { findFirst: jest.Mock };
    resource: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let appointmentsService: { create: jest.Mock };
  let service: SurgeryService;

  const baseRequest = {
    id: requestId,
    hospitalId,
    branchId: branchA,
    patientId,
    encounterId,
    preAuthorizationId: null as string | null,
    status: SurgeryRequestStatus.PRE_OP,
    procedureName: 'Appendectomy',
    preOpAssessment: { fitnessStatus: 'FIT' },
    schedule: null,
  };

  const scheduleDto = {
    resourceId,
    startAt: new Date(Date.now() + 86400000).toISOString(),
    endAt: new Date(Date.now() + 90000000).toISOString(),
  };

  beforeEach(() => {
    prisma = {
      surgeryRequest: {
        findFirst: jest.fn().mockResolvedValue({ ...baseRequest }),
        update: jest.fn(),
      },
      surgerySchedule: {
        create: jest.fn().mockResolvedValue({ id: 'sched-1' }),
        update: jest.fn().mockResolvedValue({ id: 'sched-1' }),
      },
      insurancePreAuthorization: { findFirst: jest.fn() },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: branchA, hospitalId }),
      },
      resource: {
        findFirst: jest.fn().mockResolvedValue({
          id: resourceId,
          hospitalId,
          branchId: branchA,
          type: ResourceType.OPERATION_THEATRE,
        }),
      },
      $transaction: jest.fn(async (cb) =>
        cb({
          surgerySchedule: prisma.surgerySchedule,
          surgeryRequest: prisma.surgeryRequest,
        }),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    appointmentsService = {
      create: jest.fn().mockResolvedValue({ id: 'appt-1' }),
    };
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

  function mockPreAuth(status: InsurancePreAuthorizationStatus, overrides: Partial<{
    patientId: string;
    hospitalId: string;
    branchId: string | null;
  }> = {}) {
    prisma.insurancePreAuthorization.findFirst.mockResolvedValue({
      id: preAuthId,
      hospitalId,
      patientId,
      branchId: branchA,
      status,
      ...overrides,
    });
  }

  function setRequest(overrides: Partial<typeof baseRequest>) {
    prisma.surgeryRequest.findFirst.mockResolvedValue({
      ...baseRequest,
      ...overrides,
    });
  }

  it('allows scheduling without preAuthorizationId', async () => {
    await service.scheduleRequest(user, requestId, scheduleDto);
    expect(appointmentsService.create).toHaveBeenCalled();
    expect(prisma.insurancePreAuthorization.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    InsurancePreAuthorizationStatus.APPROVED,
    InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
  ])('allows scheduling with %s preauth', async (status) => {
    setRequest({ preAuthorizationId: preAuthId });
    mockPreAuth(status);
    await service.scheduleRequest(user, requestId, scheduleDto);
    expect(appointmentsService.create).toHaveBeenCalled();
  });

  it.each([
    InsurancePreAuthorizationStatus.DRAFT,
    InsurancePreAuthorizationStatus.SUBMITTED,
    InsurancePreAuthorizationStatus.UNDER_REVIEW,
    InsurancePreAuthorizationStatus.REJECTED,
    InsurancePreAuthorizationStatus.CANCELLED,
  ])('rejects scheduling when preauth is %s', async (status) => {
    setRequest({ preAuthorizationId: preAuthId });
    mockPreAuth(status);
    await expect(
      service.scheduleRequest(user, requestId, scheduleDto),
    ).rejects.toThrow(BadRequestException);
    expect(appointmentsService.create).not.toHaveBeenCalled();
  });

  it('rejects wrong patient preauth', async () => {
    setRequest({ preAuthorizationId: preAuthId });
    mockPreAuth(InsurancePreAuthorizationStatus.APPROVED, {
      patientId: otherPatientId,
    });
    await expect(
      service.scheduleRequest(user, requestId, scheduleDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects wrong hospital preauth', async () => {
    setRequest({ preAuthorizationId: preAuthId });
    prisma.insurancePreAuthorization.findFirst.mockResolvedValue(null);
    await expect(
      service.scheduleRequest(user, requestId, scheduleDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects wrong branch preauth for branch user', async () => {
    setRequest({ preAuthorizationId: preAuthId });
    mockPreAuth(InsurancePreAuthorizationStatus.APPROVED, { branchId: branchB });
    await expect(
      service.scheduleRequest(user, requestId, scheduleDto),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects NOT_FIT even with approved preauth', async () => {
    setRequest({
      preAuthorizationId: preAuthId,
      preOpAssessment: { fitnessStatus: 'NOT_FIT' },
    });
    mockPreAuth(InsurancePreAuthorizationStatus.APPROVED);
    await expect(
      service.scheduleRequest(user, requestId, scheduleDto),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.insurancePreAuthorization.findFirst).not.toHaveBeenCalled();
  });

  it('rejects start when preauth is not approved', async () => {
    setRequest({
      preAuthorizationId: preAuthId,
      status: SurgeryRequestStatus.SCHEDULED,
      schedule: { id: 'sched-1', branchId: branchA },
    });
    mockPreAuth(InsurancePreAuthorizationStatus.SUBMITTED);
    await expect(service.startRequest(user, requestId)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.surgeryRequest.update).not.toHaveBeenCalled();
  });

  it('allows start with approved preauth', async () => {
    setRequest({
      preAuthorizationId: preAuthId,
      status: SurgeryRequestStatus.SCHEDULED,
      schedule: { id: 'sched-1', branchId: branchA },
    });
    mockPreAuth(InsurancePreAuthorizationStatus.APPROVED);
    await service.startRequest(user, requestId);
    expect(prisma.surgeryRequest.update).toHaveBeenCalled();
  });
});
