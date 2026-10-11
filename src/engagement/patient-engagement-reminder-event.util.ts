import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';
import { PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY } from '../notifications/notification-policy.constants';

export function patientEngagementFollowUpIdempotencyKey(
  actionId: string,
): string {
  return `${PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY}:${actionId}`;
}

export function buildPatientEngagementFollowUpDomainEvent(input: {
  actionId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  suggestedAction?: string | null;
}): DomainEventEnvelope {
  const text =
    input.suggestedAction?.trim() ||
    'We would like to follow up regarding your care. Please contact the clinic to schedule your next visit.';
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY,
    entityType: 'PatientEngagementAction',
    entityId: input.actionId,
    idempotencyKey: patientEngagementFollowUpIdempotencyKey(input.actionId),
    payload: {
      engagementActionId: input.actionId,
      patientId: input.patientId,
      hospitalId: input.hospitalId,
      branchId: input.branchId,
      channel: NOTIFICATION_CHANNEL_WHATSAPP,
      text,
    } as unknown as Prisma.InputJsonValue,
  };
}
