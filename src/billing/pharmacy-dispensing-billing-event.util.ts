import { Prisma } from '@prisma/client';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const PHARMACY_DISPENSING_BILLING_EVENT_TYPE =
  'pharmacy.dispensing.completed';

export const PHARMACY_DISPENSING_ENTITY_TYPE = 'PharmacyDispensing';

export type PharmacyDispensingBillingEventPayload = {
  dispensingId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
};

export function pharmacyDispensingBillingIdempotencyKey(
  dispensingId: string,
): string {
  return `${PHARMACY_DISPENSING_BILLING_EVENT_TYPE}:${dispensingId}`;
}

export function buildPharmacyDispensingBillingDomainEvent(input: {
  dispensingId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const payload: PharmacyDispensingBillingEventPayload = {
    dispensingId: input.dispensingId,
    patientId: input.patientId,
    hospitalId: input.hospitalId,
    branchId: input.branchId,
  };

  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: PHARMACY_DISPENSING_BILLING_EVENT_TYPE,
    entityType: PHARMACY_DISPENSING_ENTITY_TYPE,
    entityId: input.dispensingId,
    idempotencyKey: pharmacyDispensingBillingIdempotencyKey(input.dispensingId),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function pharmacyDispensingItemSourceKey(dispensingItemId: string): string {
  return `pharmacy.dispensing.item:${dispensingItemId}`;
}
