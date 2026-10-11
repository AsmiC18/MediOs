import { EmergencyPriority } from '@prisma/client';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import {
  EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
  TRIAGE_RECORD_ENTITY_TYPE,
  buildEmergencyVisitEscalatedDomainEvent,
  emergencyVisitEscalatedIdempotencyKey,
} from './emergency-visit-escalated-event.util';

describe('emergency visit escalated domain event', () => {
  const input = {
    emergencyVisitId: 'visit-1',
    triageRecordId: 'triage-1',
    patientId: 'patient-1',
    hospitalId: 'hospital-1',
    branchId: 'branch-1',
    visitPriority: EmergencyPriority.URGENT,
    triagePriority: EmergencyPriority.EMERGENCY,
    escalationReason: 'Deteriorating vitals',
    escalatedByUserId: 'user-1',
  };

  it('uses deterministic idempotency key per triage record', () => {
    expect(emergencyVisitEscalatedIdempotencyKey('triage-1')).toBe(
      `${EMERGENCY_VISIT_ESCALATED_EVENT_TYPE}:triage-1`,
    );
  });

  it('builds envelope with unrouted internal channel', () => {
    const envelope = buildEmergencyVisitEscalatedDomainEvent(input);
    expect(envelope.eventType).toBe(EMERGENCY_VISIT_ESCALATED_EVENT_TYPE);
    expect(envelope.entityType).toBe(TRIAGE_RECORD_ENTITY_TYPE);
    expect(envelope.entityId).toBe('triage-1');
    expect(envelope.idempotencyKey).toBe(
      emergencyVisitEscalatedIdempotencyKey('triage-1'),
    );

    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.channel).toBe(NOTIFICATION_CHANNEL_UNROUTED);
    expect(payload.emergencyVisitId).toBe('visit-1');
    expect(payload.patientId).toBe('patient-1');
    expect(payload.escalatedByUserId).toBe('user-1');
    expect(payload.escalationReason).toBe('Deteriorating vitals');
  });
});
