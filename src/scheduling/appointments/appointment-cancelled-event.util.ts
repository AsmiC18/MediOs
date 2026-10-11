import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../../notifications/notification.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';
import { APPOINTMENT_ENTITY_TYPE } from './appointment-booked-event.util';

export const APPOINTMENT_CANCELLED_EVENT_TYPE = 'appointment.cancelled';

export type AppointmentCancelledEventSnapshot = {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  scheduledAt: string;
  channel: typeof NOTIFICATION_CHANNEL_WHATSAPP;
  text: string;
};

export type AppointmentForCancelledEvent = {
  id: string;
  hospitalId: string;
  branchId: string | null;
  patientId: string;
  startAt: Date;
};

export function appointmentCancelledIdempotencyKey(
  appointmentId: string,
): string {
  return `${APPOINTMENT_CANCELLED_EVENT_TYPE}:${appointmentId}`;
}

function buildAppointmentCancelledText(scheduledAt: Date): string {
  return `Your appointment scheduled for ${scheduledAt.toISOString()} has been cancelled.`;
}

export function buildAppointmentCancelledEventPayload(
  appointment: AppointmentForCancelledEvent,
): AppointmentCancelledEventSnapshot {
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    scheduledAt: appointment.startAt.toISOString(),
    channel: NOTIFICATION_CHANNEL_WHATSAPP,
    text: buildAppointmentCancelledText(appointment.startAt),
  };
}

export function buildAppointmentCancelledDomainEvent(
  appointment: AppointmentForCancelledEvent,
): DomainEventEnvelope {
  const payload = buildAppointmentCancelledEventPayload(appointment);
  return {
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    eventType: APPOINTMENT_CANCELLED_EVENT_TYPE,
    entityType: APPOINTMENT_ENTITY_TYPE,
    entityId: appointment.id,
    idempotencyKey: appointmentCancelledIdempotencyKey(appointment.id),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
