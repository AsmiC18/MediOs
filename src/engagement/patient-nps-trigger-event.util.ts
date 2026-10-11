import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../notifications/notification.constants';
import { DomainEventEnvelope } from '../notifications/domain-event.types';
import { PATIENT_NPS_REQUEST_CATEGORY } from '../notifications/notification-policy.constants';

export const PATIENT_NPS_ENTITY_TYPE = 'Appointment';

export function patientNpsTriggerIdempotencyKey(appointmentId: string): string {
  return `patient.nps.trigger:${appointmentId}`;
}

export function patientNpsJobIdempotencyKey(appointmentId: string): string {
  return `patient.nps.trigger:${appointmentId}`;
}

export function buildPatientNpsRequestDomainEvent(input: {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const text =
    'Thank you for your recent visit. Please share your feedback (0-10) via the patient portal.';
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: PATIENT_NPS_REQUEST_CATEGORY,
    entityType: PATIENT_NPS_ENTITY_TYPE,
    entityId: input.appointmentId,
    idempotencyKey: patientNpsTriggerIdempotencyKey(input.appointmentId),
    payload: {
      appointmentId: input.appointmentId,
      patientId: input.patientId,
      hospitalId: input.hospitalId,
      branchId: input.branchId,
      channel: NOTIFICATION_CHANNEL_WHATSAPP,
      text,
    } as unknown as Prisma.InputJsonValue,
  };
}
