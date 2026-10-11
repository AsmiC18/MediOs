import { AppointmentStatus } from '@prisma/client';
import {
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
  APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS,
  computeReminder24hStartWindow,
} from './appointment-reminder-24h-scheduler.util';

describe('appointment reminder 24h window (pure)', () => {
  it('computes windowStart as tickAt + 24 hours', () => {
    const tickAt = new Date('2026-12-15T10:00:00.000Z');
    const { windowStart, windowEnd } = computeReminder24hStartWindow(tickAt);
    expect(windowStart.toISOString()).toBe('2026-12-16T10:00:00.000Z');
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(
      APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS,
    );
    expect(windowEnd.getTime() - tickAt.getTime()).toBe(
      APPOINTMENT_REMINDER_24H_OFFSET_MS +
        APPOINTMENT_REMINDER_SCHEDULER_WINDOW_MS,
    );
  });
});

describe('appointment reminder eligibility (unit)', () => {
  it('SCHEDULED is the only active status used for reminders', () => {
    expect(AppointmentStatus.SCHEDULED).toBe('SCHEDULED');
    expect(AppointmentStatus.CANCELLED).not.toBe(AppointmentStatus.SCHEDULED);
    expect(AppointmentStatus.COMPLETED).not.toBe(AppointmentStatus.SCHEDULED);
    expect(AppointmentStatus.NO_SHOW).not.toBe(AppointmentStatus.SCHEDULED);
  });
});
