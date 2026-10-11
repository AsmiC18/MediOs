import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EmergencyPriority,
  EmergencyVisitStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import {
  EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
  emergencyVisitEscalatedIdempotencyKey,
} from './emergency-visit-escalated-event.util';
import { EmergencyService } from './emergency.service';

describe('EmergencyService escalation (A4.3)', () => {
  const hospitalId = '11111111-1111-4111-8111-111111111111';
  const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { sub: 'user-1', hospitalId, branchId };

  let prisma: {
    emergencyVisit: { findUnique: jest.Mock };
    triageRecord: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let outboxService: {
    createInTransaction: jest.Mock;
    enqueueDispatchInTransaction: jest.Mock;
  };
  let service: EmergencyService;

  const triageId = 'triage-1';
  const visitId = 'visit-1';

  const visitWithTriage = {
    id: visitId,
    hospitalId,
    branchId,
    patientId: 'patient-1',
    encounterId: 'enc-1',
    status: EmergencyVisitStatus.TRIAGED,
    priority: EmergencyPriority.URGENT,
    chiefComplaint: 'Pain',
    notes: null,
    disposition: null,
    treatmentStartedAt: null,
    dispositionAt: null,
    arrivalAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: {},
    branch: {},
    encounter: {},
    triageRecords: [
      {
        id: triageId,
        priority: EmergencyPriority.EMERGENCY,
        escalatedAt: null,
        assessedAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    const txTriageUpdate = jest.fn().mockResolvedValue({
      id: triageId,
      emergencyVisitId: visitId,
      priority: EmergencyPriority.EMERGENCY,
      assessedAt: new Date(),
      assessedBy: { id: user.sub, name: 'Nurse', email: 'n@x.com' },
      escalatedAt: new Date(),
      escalationReason: 'Worsening',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    outboxService = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      enqueueDispatchInTransaction: jest
        .fn()
        .mockResolvedValue({ id: 'job-1', type: JOB_TYPES.NOTIFICATION_DISPATCH }),
    };

    prisma = {
      emergencyVisit: {
        findUnique: jest.fn().mockResolvedValue(visitWithTriage),
      },
      triageRecord: { update: txTriageUpdate },
      $transaction: jest.fn(async (callback) =>
        callback({
          triageRecord: { update: txTriageUpdate },
        }),
      ),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new EmergencyService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      outboxService as unknown as DomainEventOutboxService,
      { notifyEscalation: jest.fn().mockResolvedValue(0) } as never,
      { enqueueAfterCommit: jest.fn() } as never,
    );
  });

  it('creates outbox and notification.dispatch job in the escalation transaction', async () => {
    await service.escalate(user, visitId, { reason: 'Worsening' });

    expect(outboxService.createInTransaction).toHaveBeenCalledTimes(1);
    const [, event] = outboxService.createInTransaction.mock.calls[0];
    expect(event.eventType).toBe(EMERGENCY_VISIT_ESCALATED_EVENT_TYPE);
    expect(event.hospitalId).toBe(hospitalId);
    expect(event.branchId).toBe(branchId);
    expect(event.idempotencyKey).toBe(
      emergencyVisitEscalatedIdempotencyKey(triageId),
    );
    const payload = event.payload as Record<string, unknown>;
    expect(payload.emergencyVisitId).toBe(visitId);
    expect(payload.patientId).toBe('patient-1');
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);

    expect(outboxService.enqueueDispatchInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hospitalId,
        branchId,
        outboxId: 'outbox-1',
      }),
    );
  });

  it('logs EMERGENCY_ESCALATED audit after successful transaction', async () => {
    await service.escalate(user, visitId, { reason: 'Worsening' });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMERGENCY_ESCALATED',
        entity: 'TriageRecord',
        entityId: triageId,
        hospitalId,
        branchId,
        userId: user.sub,
      }),
    );
  });

  it('denies branch user escalating another branch visit', async () => {
    prisma.emergencyVisit.findUnique.mockResolvedValue({
      ...visitWithTriage,
      branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    await expect(
      service.escalate(user, visitId, { reason: 'x' }),
    ).rejects.toThrow(ForbiddenException);

    expect(outboxService.createInTransaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects already escalated visit without duplicate outbox', async () => {
    prisma.emergencyVisit.findUnique.mockResolvedValue({
      ...visitWithTriage,
      triageRecords: [
        {
          ...visitWithTriage.triageRecords[0],
          escalatedAt: new Date(),
        },
      ],
    });

    await expect(
      service.escalate(user, visitId, { reason: 'again' }),
    ).rejects.toThrow(BadRequestException);

    expect(outboxService.createInTransaction).not.toHaveBeenCalled();
  });

  it('does not commit escalation when outbox creation fails', async () => {
    outboxService.createInTransaction.mockRejectedValueOnce(
      new Error('outbox failure'),
    );

    await expect(
      service.escalate(user, visitId, { reason: 'Worsening' }),
    ).rejects.toThrow('outbox failure');

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
