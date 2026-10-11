import { Prisma } from '@prisma/client';
import { NOTIFICATION_CHANNEL_WHATSAPP } from '../../notifications/notification.constants';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';
import { APPOINTMENT_ENTITY_TYPE } from './appointment-booked-event.util';
import {
  APPOINTMENT_REMINDER_48H_EVENT_TYPE,
  APPOINTMENT_REMINDER_1H_EVENT_TYPE,
  AppointmentReminderOffsetHours,
} from './appointment-reminder-policy.util';

export type AppointmentReminderEventSnapshot = {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  scheduledAt: string;
  channel: typeof NOTIFICATION_CHANNEL_WHATSAPP;
  text: string;
};

export type AppointmentForReminderEvent = {
  id: string;
  hospitalId: string;
  branchId: string | null;
  patientId: string;
  startAt: Date;
};

export function appointmentReminderIdempotencyKey(
  eventType: string,
  appointmentId: string,
): string {
  return `${eventType}:${appointmentId}`;
}

export function buildAppointmentReminderText(
  offsetHours: AppointmentReminderOffsetHours,
  scheduledAt: Date,
): string {
  const iso = scheduledAt.toISOString();
  if (offsetHours === 24) {
    return `Reminder: your appointment is scheduled for ${iso}.`;
  }
  if (offsetHours === 48) {
    return `Your appointment is in 48 hours, scheduled for ${iso}.`;
  }
  return `Your appointment is in 1 hour, scheduled for ${iso}.`;
}

export function eventTypeForReminderOffsetHours(
  offsetHours: AppointmentReminderOffsetHours,
): string {
  if (offsetHours === 48) {
    return APPOINTMENT_REMINDER_48H_EVENT_TYPE;
  }
  if (offsetHours === 24) {
    return 'appointment.reminder.24h';
  }
  return APPOINTMENT_REMINDER_1H_EVENT_TYPE;
}

export function buildAppointmentReminderEventPayload(
  appointment: AppointmentForReminderEvent,
  offsetHours: AppointmentReminderOffsetHours,
): AppointmentReminderEventSnapshot {
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    scheduledAt: appointment.startAt.toISOString(),
    channel: NOTIFICATION_CHANNEL_WHATSAPP,
    text: buildAppointmentReminderText(offsetHours, appointment.startAt),
  };
}

export function buildAppointmentReminderDomainEvent(
  appointment: AppointmentForReminderEvent,
  offsetHours: AppointmentReminderOffsetHours,
): DomainEventEnvelope {
  const eventType = eventTypeForReminderOffsetHours(offsetHours);
  const payload = buildAppointmentReminderEventPayload(appointment, offsetHours);
  return {
    hospitalId: appointment.hospitalId,
    branchId: appointment.branchId,
    eventType,
    entityType: APPOINTMENT_ENTITY_TYPE,
    entityId: appointment.id,
    idempotencyKey: appointmentReminderIdempotencyKey(eventType, appointment.id),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
