import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../../notifications/notification.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';

export const APPOINTMENT_BOOKED_EVENT_TYPE = 'appointment.booked';

export const APPOINTMENT_ENTITY_TYPE = 'Appointment';

export type AppointmentBookedEventSnapshot = {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  scheduledAt: string;
  channel: typeof NOTIFICATION_CHANNEL_WHATSAPP;
  text: string;
};

export type AppointmentForBookedEvent = {
  id: string;
  hospitalId: string;
  branchId: string | null;
  patientId: string;
  startAt: Date;
};

export function appointmentBookedIdempotencyKey(appointmentId: string): string {
  return `${APPOINTMENT_BOOKED_EVENT_TYPE}:${appointmentId}`;
}

function buildAppointmentBookedText(scheduledAt: Date): string {
  return `Your appointment is booked for ${scheduledAt.toISOString()}.`;
}

export function buildAppointmentBookedEventPayload(
  appointment: AppointmentForBookedEvent,
): AppointmentBookedEventSnapshot {
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    scheduledAt: appointment.startAt.toISOString(),
    channel: NOTIFICATION_CHANNEL_WHATSAPP,
    text: buildAppointmentBookedText(appointment.startAt),
  };
}

export function buildAppointmentBookedDomainEvent(
  appointment: AppointmentForBookedEvent,
): DomainEventEnvelope {
  const payload = buildAppointmentBookedEventPayload(appointment);
  return {
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    eventType: APPOINTMENT_BOOKED_EVENT_TYPE,
    entityType: APPOINTMENT_ENTITY_TYPE,
    entityId: appointment.id,
    idempotencyKey: appointmentBookedIdempotencyKey(appointment.id),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
