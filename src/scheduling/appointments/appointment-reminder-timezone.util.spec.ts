import { DateTime } from 'luxon';
import {
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
} from './appointment-reminder-policy.util';
import {
  computeReminderDueInstant,
  computeReminderStartAtWindow,
  isReminderDueInTimezoneTickWindow,
} from './appointment-reminder-timezone.util';

describe('appointment reminder timezone window (pure)', () => {
  it('UTC window matches elapsed offset from tick (H5 compatible)', () => {
    const tickAt = new Date('2026-12-15T10:00:00.000Z');
    const { windowStart, windowEnd } = computeReminderStartAtWindow(
      tickAt,
      APPOINTMENT_REMINDER_24H_OFFSET_MS,
      'UTC',
    );
    expect(windowStart.toISOString()).toBe('2026-12-16T10:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-12-16T10:01:00.000Z');
  });

  it('due instant subtracts elapsed offset without shifting appointment storage', () => {
    const startAt = new Date('2026-10-10T10:00:00.000Z');
    const due = computeReminderDueInstant(startAt, APPOINTMENT_REMINDER_24H_OFFSET_MS);
    expect(due.toISOString()).toBe('2026-10-09T10:00:00.000Z');
    expect(startAt.toISOString()).toBe('2026-10-10T10:00:00.000Z');
  });

  it('America/New_York DST fall-back uses timezone-aware local minute', () => {
    const tickAt = new Date('2026-11-01T05:30:00.000Z');
    const { windowStart, windowEnd } = computeReminderStartAtWindow(
      tickAt,
      60 * 60 * 1000,
      'America/New_York',
    );
    const dueStart = DateTime.fromJSDate(windowStart).minus({ hours: 1 }).toUTC();
    const dueEnd = DateTime.fromJSDate(windowEnd).minus({ hours: 1 }).toUTC();
    expect(
      isReminderDueInTimezoneTickWindow(
        dueStart.toJSDate(),
        tickAt,
        'America/New_York',
      ),
    ).toBe(true);
    expect(dueEnd.toMillis() - dueStart.toMillis()).toBe(60_000);
  });
});
