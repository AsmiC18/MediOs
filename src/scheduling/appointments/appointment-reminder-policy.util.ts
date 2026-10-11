import {
  APPOINTMENT_REMINDER_1H_CATEGORY,
  APPOINTMENT_REMINDER_24H_CATEGORY,
  APPOINTMENT_REMINDER_48H_CATEGORY,
} from '../../notifications/notification-policy.constants';

export type AppointmentReminderOffsetHours = 48 | 24 | 1;

export type AppointmentReminderOffsetPolicy = {
  offsetHours: AppointmentReminderOffsetHours;
  offsetMs: number;
  eventType: string;
  category: string;
};

export const APPOINTMENT_REMINDER_48H_EVENT_TYPE = 'appointment.reminder.48h';
export const APPOINTMENT_REMINDER_1H_EVENT_TYPE = 'appointment.reminder.1h';

/** Elapsed-time offsets (ms); not calendar-day subtraction. */
export const APPOINTMENT_REMINDER_48H_OFFSET_MS = 48 * 60 * 60 * 1000;
export const APPOINTMENT_REMINDER_24H_OFFSET_MS = 24 * 60 * 60 * 1000;
export const APPOINTMENT_REMINDER_1H_OFFSET_MS = 60 * 60 * 1000;

export const APPOINTMENT_REMINDER_OFFSET_POLICIES: AppointmentReminderOffsetPolicy[] =
  [
    {
      offsetHours: 48,
      offsetMs: APPOINTMENT_REMINDER_48H_OFFSET_MS,
      eventType: APPOINTMENT_REMINDER_48H_EVENT_TYPE,
      category: APPOINTMENT_REMINDER_48H_CATEGORY,
    },
    {
      offsetHours: 24,
      offsetMs: APPOINTMENT_REMINDER_24H_OFFSET_MS,
      eventType: 'appointment.reminder.24h',
      category: APPOINTMENT_REMINDER_24H_CATEGORY,
    },
    {
      offsetHours: 1,
      offsetMs: APPOINTMENT_REMINDER_1H_OFFSET_MS,
      eventType: APPOINTMENT_REMINDER_1H_EVENT_TYPE,
      category: APPOINTMENT_REMINDER_1H_CATEGORY,
    },
  ];
