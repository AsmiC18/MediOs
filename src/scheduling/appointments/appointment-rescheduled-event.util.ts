import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../../notifications/notification.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';
import { APPOINTMENT_ENTITY_TYPE } from './appointment-booked-event.util';

export const APPOINTMENT_RESCHEDULED_EVENT_TYPE = 'appointment.rescheduled';

export type AppointmentRescheduledEventSnapshot = {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  previousScheduledAt: string;
  scheduledAt: string;
  channel: typeof NOTIFICATION_CHANNEL_WHATSAPP;
  text: string;
};

export type AppointmentForRescheduledEvent = {
  id: string;
  hospitalId: string;
  branchId: string | null;
  patientId: string;
  previousStartAt: Date;
  newStartAt: Date;
};

export function appointmentRescheduledIdempotencyKey(
  appointmentId: string,
  newStartAt: Date,
): string {
  return `${APPOINTMENT_RESCHEDULED_EVENT_TYPE}:${appointmentId}:${newStartAt.toISOString()}`;
}

export function isAppointmentStartAtRescheduled(
  previousStartAt: Date,
  nextStartAt: Date,
): boolean {
  return previousStartAt.getTime() !== nextStartAt.getTime();
}

function buildAppointmentRescheduledText(
  previousStartAt: Date,
  newStartAt: Date,
): string {
  return `Your appointment has been rescheduled from ${previousStartAt.toISOString()} to ${newStartAt.toISOString()}.`;
}

export function buildAppointmentRescheduledEventPayload(
  appointment: AppointmentForRescheduledEvent,
): AppointmentRescheduledEventSnapshot {
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    previousScheduledAt: appointment.previousStartAt.toISOString(),
    scheduledAt: appointment.newStartAt.toISOString(),
    channel: NOTIFICATION_CHANNEL_WHATSAPP,
    text: buildAppointmentRescheduledText(
      appointment.previousStartAt,
      appointment.newStartAt,
    ),
  };
}

export function buildAppointmentRescheduledDomainEvent(
  appointment: AppointmentForRescheduledEvent,
): DomainEventEnvelope {
  const payload = buildAppointmentRescheduledEventPayload(appointment);
  return {
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    eventType: APPOINTMENT_RESCHEDULED_EVENT_TYPE,
    entityType: APPOINTMENT_ENTITY_TYPE,
    entityId: appointment.id,
    idempotencyKey: appointmentRescheduledIdempotencyKey(
      appointment.id,
      appointment.newStartAt,
    ),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
