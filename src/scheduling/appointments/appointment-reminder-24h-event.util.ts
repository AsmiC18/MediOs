import { DomainEventEnvelope } from '../../notifications/domain-event.types';
import {
  appointmentReminderIdempotencyKey,
  AppointmentForReminderEvent,
  AppointmentReminderEventSnapshot,
  buildAppointmentReminderDomainEvent,
  buildAppointmentReminderEventPayload,
} from './appointment-reminder-event.util';

export const APPOINTMENT_REMINDER_24H_EVENT_TYPE = 'appointment.reminder.24h';

export type AppointmentReminder24hEventSnapshot = AppointmentReminderEventSnapshot;

export type AppointmentForReminder24hEvent = AppointmentForReminderEvent;

export function appointmentReminder24hIdempotencyKey(
  appointmentId: string,
): string {
  return appointmentReminderIdempotencyKey(
    APPOINTMENT_REMINDER_24H_EVENT_TYPE,
    appointmentId,
  );
}

export function buildAppointmentReminder24hEventPayload(
  appointment: AppointmentForReminder24hEvent,
): AppointmentReminder24hEventSnapshot {
  return buildAppointmentReminderEventPayload(appointment, 24);
}

export function buildAppointmentReminder24hDomainEvent(
  appointment: AppointmentForReminder24hEvent,
): DomainEventEnvelope {
  return buildAppointmentReminderDomainEvent(appointment, 24);
}
