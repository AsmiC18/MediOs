import { EmergencyPriority, Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const EMERGENCY_VISIT_ESCALATED_EVENT_TYPE = 'emergency.visit.escalated';

export const TRIAGE_RECORD_ENTITY_TYPE = 'TriageRecord';

export type EmergencyVisitEscalatedEventSnapshot = {
  emergencyVisitId: string;
  triageRecordId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  visitPriority: EmergencyPriority;
  triagePriority: EmergencyPriority;
  escalationReason: string;
  escalatedByUserId: string;
  channel: typeof NOTIFICATION_CHANNEL_UNROUTED;
  summary: string;
};

export type EmergencyEscalationEventInput = {
  emergencyVisitId: string;
  triageRecordId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  visitPriority: EmergencyPriority;
  triagePriority: EmergencyPriority;
  escalationReason: string;
  escalatedByUserId: string;
};

export function emergencyVisitEscalatedIdempotencyKey(
  triageRecordId: string,
): string {
  return `${EMERGENCY_VISIT_ESCALATED_EVENT_TYPE}:${triageRecordId}`;
}

function buildEscalationSummary(
  input: EmergencyEscalationEventInput,
): string {
  return `Emergency visit ${input.emergencyVisitId} escalated (priority ${input.triagePriority}): ${input.escalationReason}`;
}

export function buildEmergencyVisitEscalatedEventPayload(
  input: EmergencyEscalationEventInput,
): EmergencyVisitEscalatedEventSnapshot {
  return {
    emergencyVisitId: input.emergencyVisitId,
    triageRecordId: input.triageRecordId,
    patientId: input.patientId,
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    visitPriority: input.visitPriority,
    triagePriority: input.triagePriority,
    escalationReason: input.escalationReason,
    escalatedByUserId: input.escalatedByUserId,
    channel: NOTIFICATION_CHANNEL_UNROUTED,
    summary: buildEscalationSummary(input),
  };
}

export function buildEmergencyVisitEscalatedDomainEvent(
  input: EmergencyEscalationEventInput,
): DomainEventEnvelope {
  const payload = buildEmergencyVisitEscalatedEventPayload(input);
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: EMERGENCY_VISIT_ESCALATED_EVENT_TYPE,
    entityType: TRIAGE_RECORD_ENTITY_TYPE,
    entityId: input.triageRecordId,
    idempotencyKey: emergencyVisitEscalatedIdempotencyKey(input.triageRecordId),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
