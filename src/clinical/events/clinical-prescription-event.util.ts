import { PrescriptionStatus, Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../../notifications/notification.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';

export const CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE =
  'clinical.prescription.created';

export const CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE =
  'clinical.prescription.status_changed';

export const PRESCRIPTION_ENTITY_TYPE = 'Prescription';

export type ClinicalPrescriptionEventSnapshot = {
  prescriptionId: string;
  patientId: string;
  encounterId: string;
  hospitalId: string;
  branchId: string | null;
  status: PrescriptionStatus;
  occurredAt: string;
  actorUserId: string;
  previousStatus?: PrescriptionStatus;
  newStatus?: PrescriptionStatus;
  channel?: typeof NOTIFICATION_CHANNEL_WHATSAPP;
  templateKey?: string;
};

export type PrescriptionForClinicalEvent = {
  id: string;
  hospitalId: string;
  branchId?: string | null;
  patientId: string;
  encounterId: string;
  status: PrescriptionStatus;
};

export function clinicalPrescriptionCreatedIdempotencyKey(
  prescriptionId: string,
): string {
  return `${CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE}:${prescriptionId}`;
}

export function clinicalPrescriptionStatusChangedIdempotencyKey(input: {
  prescriptionId: string;
  previousStatus: PrescriptionStatus;
  newStatus: PrescriptionStatus;
}): string {
  return `${CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE}:${input.prescriptionId}:${input.previousStatus}->${input.newStatus}`;
}

export function buildClinicalPrescriptionCreatedPayload(input: {
  prescription: PrescriptionForClinicalEvent;
  actorUserId: string;
  occurredAt: Date;
}): ClinicalPrescriptionEventSnapshot {
  return {
    prescriptionId: input.prescription.id,
    patientId: input.prescription.patientId,
    encounterId: input.prescription.encounterId,
    hospitalId: input.prescription.hospitalId,
    branchId: input.prescription.branchId ?? null,
    status: input.prescription.status,
    occurredAt: input.occurredAt.toISOString(),
    actorUserId: input.actorUserId,
    channel: NOTIFICATION_CHANNEL_WHATSAPP,
    templateKey: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
  };
}

export function buildClinicalPrescriptionStatusChangedPayload(input: {
  prescription: PrescriptionForClinicalEvent;
  actorUserId: string;
  occurredAt: Date;
  previousStatus: PrescriptionStatus;
  newStatus: PrescriptionStatus;
}): ClinicalPrescriptionEventSnapshot {
  return {
    prescriptionId: input.prescription.id,
    patientId: input.prescription.patientId,
    encounterId: input.prescription.encounterId,
    hospitalId: input.prescription.hospitalId,
    branchId: input.prescription.branchId ?? null,
    status: input.newStatus,
    occurredAt: input.occurredAt.toISOString(),
    actorUserId: input.actorUserId,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
  };
}

export function buildClinicalPrescriptionCreatedDomainEvent(input: {
  prescription: PrescriptionForClinicalEvent;
  actorUserId: string;
  occurredAt: Date;
}): DomainEventEnvelope {
  const payload = buildClinicalPrescriptionCreatedPayload(input);
  return {
    hospitalId: input.prescription.hospitalId,
    branchId: input.prescription.branchId ?? null,
    eventType: CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE,
    entityType: PRESCRIPTION_ENTITY_TYPE,
    entityId: input.prescription.id,
    idempotencyKey: clinicalPrescriptionCreatedIdempotencyKey(
      input.prescription.id,
    ),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function buildClinicalPrescriptionStatusChangedDomainEvent(input: {
  prescription: PrescriptionForClinicalEvent;
  actorUserId: string;
  occurredAt: Date;
  previousStatus: PrescriptionStatus;
  newStatus: PrescriptionStatus;
}): DomainEventEnvelope {
  const payload = buildClinicalPrescriptionStatusChangedPayload(input);
  return {
    hospitalId: input.prescription.hospitalId,
    branchId: input.prescription.branchId ?? null,
    eventType: CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE,
    entityType: PRESCRIPTION_ENTITY_TYPE,
    entityId: input.prescription.id,
    idempotencyKey: clinicalPrescriptionStatusChangedIdempotencyKey({
      prescriptionId: input.prescription.id,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
    }),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Pharmacy worklist updates are driven for all prescription lifecycle events.
 * Patient notifications are emitted only on clinical.prescription.created (see outbox service).
 */
export function shouldEnqueuePharmacyPrescriptionProcess(
  eventType: string,
): boolean {
  return (
    eventType === CLINICAL_PRESCRIPTION_CREATED_EVENT_TYPE ||
    eventType === CLINICAL_PRESCRIPTION_STATUS_CHANGED_EVENT_TYPE
  );
}
