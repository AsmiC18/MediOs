import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_UNROUTED } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const INSURANCE_CLAIM_SUBMITTED_EVENT_TYPE = 'insurance.claim.submitted';

export type InsuranceClaimSubmittedEventInput = {
  claimId: string;
  claimNumber: string;
  hospitalId: string;
  branchId: string | null;
  patientId: string;
};

export function insuranceClaimSubmittedIdempotencyKey(claimId: string): string {
  return `${INSURANCE_CLAIM_SUBMITTED_EVENT_TYPE}:${claimId}`;
}

export function buildInsuranceClaimSubmittedDomainEvent(
  input: InsuranceClaimSubmittedEventInput,
): DomainEventEnvelope {
  const payload = {
    claimId: input.claimId,
    claimNumber: input.claimNumber,
    patientId: input.patientId,
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    channel: NOTIFICATION_CHANNEL_UNROUTED,
    summary: `Insurance claim ${input.claimNumber} was submitted.`,
  };

  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: INSURANCE_CLAIM_SUBMITTED_EVENT_TYPE,
    entityType: 'InsuranceClaim',
    entityId: input.claimId,
    idempotencyKey: insuranceClaimSubmittedIdempotencyKey(input.claimId),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
