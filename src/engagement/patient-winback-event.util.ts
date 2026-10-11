import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';
import { PATIENT_WINBACK_REQUESTED_CATEGORY } from '../notifications/notification-policy.constants';

export function patientWinbackOutboxIdempotencyKey(
  campaignId: string,
  patientId: string,
): string {
  return `${PATIENT_WINBACK_REQUESTED_CATEGORY}:${campaignId}:${patientId}`;
}

export function buildPatientWinbackRequestedDomainEvent(input: {
  campaignId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const text =
    'We miss you at the clinic. Please contact us to schedule your next visit when convenient.';
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: PATIENT_WINBACK_REQUESTED_CATEGORY,
    entityType: 'PatientWinbackCampaign',
    entityId: input.campaignId,
    idempotencyKey: patientWinbackOutboxIdempotencyKey(
      input.campaignId,
      input.patientId,
    ),
    payload: {
      campaignId: input.campaignId,
      patientId: input.patientId,
      hospitalId: input.hospitalId,
      branchId: input.branchId,
      channel: NOTIFICATION_CHANNEL_WHATSAPP,
      text,
    } as unknown as Prisma.InputJsonValue,
  };
}
