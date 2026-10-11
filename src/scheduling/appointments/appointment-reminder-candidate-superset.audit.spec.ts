import { DateTime } from 'luxon';
import {
  APPOINTMENT_REMINDER_1H_OFFSET_MS,
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
  APPOINTMENT_REMINDER_48H_OFFSET_MS,
} from './appointment-reminder-policy.util';
import {
  computeReminderStartAtWindow,
  APPOINTMENT_REMINDER_TIMEZONE_FALLBACK,
} from './appointment-reminder-timezone.util';
import { computeReminderStartAtWindowUtc } from './appointment-reminder-scheduler.util';

const TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Australia/Sydney',
];

const OFFSETS = [
  APPOINTMENT_REMINDER_1H_OFFSET_MS,
  APPOINTMENT_REMINDER_24H_OFFSET_MS,
  APPOINTMENT_REMINDER_48H_OFFSET_MS,
];

function isEligibleFinal(
  tickAt: Date,
  startAt: Date,
  offsetMs: number,
  timezone: string,
): boolean {
  const { windowStart, windowEnd } = computeReminderStartAtWindow(
    tickAt,
    offsetMs,
    timezone,
  );
  return startAt >= windowStart && startAt < windowEnd;
}

function isInUtcCandidateWindow(
  tickAt: Date,
  startAt: Date,
  offsetMs: number,
): boolean {
  const { windowStart, windowEnd } = computeReminderStartAtWindowUtc(
    tickAt,
    offsetMs,
  );
  return startAt >= windowStart && startAt < windowEnd;
}

describe('H6-D candidate scan superset audit (pure)', () => {
  it('documents exact windows used in production', () => {
    const tickAt = new Date('2026-06-15T10:00:30.000Z');
    const offset = APPOINTMENT_REMINDER_24H_OFFSET_MS;
    const utc = computeReminderStartAtWindowUtc(tickAt, offset);
    const ny = computeReminderStartAtWindow(tickAt, offset, 'America/New_York');
    expect(utc.windowStart.toISOString()).toBe('2026-06-16T10:00:00.000Z');
    expect(utc.windowEnd.toISOString()).toBe('2026-06-16T10:01:00.000Z');
    expect(ny.windowStart.toISOString()).toBe('2026-06-16T10:00:00.000Z');
    expect(ny.windowEnd.toISOString()).toBe('2026-06-16T10:01:00.000Z');
  });

  it('finds no counterexample: TZ-eligible startAt always in UTC candidate window', () => {
    const counterexamples: string[] = [];
    const tickAnchors = [
      '2026-03-08T07:00:00.000Z',
      '2026-03-08T07:30:00.000Z',
      '2026-11-01T05:00:00.000Z',
      '2026-11-01T06:00:00.000Z',
      '2026-06-15T10:00:30.000Z',
      '2026-01-15T23:30:45.000Z',
      '2026-07-01T00:00:30.000Z',
      '2026-12-31T23:59:30.000Z',
    ];

    for (const anchor of tickAnchors) {
      const tickAt = new Date(anchor);
      for (let deltaSec = -120; deltaSec <= 120; deltaSec += 15) {
        const tick = new Date(tickAt.getTime() + deltaSec * 1000);
        for (const tz of TIMEZONES) {
          for (const offsetMs of OFFSETS) {
            const { windowStart, windowEnd } = computeReminderStartAtWindow(
              tick,
              offsetMs,
              tz,
            );
            for (let probe = -5000; probe <= 5000; probe += 1000) {
              const startAt = new Date(
                windowStart.getTime() +
                  probe +
                  Math.floor((windowEnd.getTime() - windowStart.getTime()) / 2),
              );
              if (!isEligibleFinal(tick, startAt, offsetMs, tz)) {
                continue;
              }
              if (!isInUtcCandidateWindow(tick, startAt, offsetMs)) {
                counterexamples.push(
                  `tick=${tick.toISOString()} tz=${tz} offset=${offsetMs} startAt=${startAt.toISOString()}`,
                );
              }
            }
            const edgeStart = new Date(windowStart.getTime());
            const edgeAlmostEnd = new Date(windowEnd.getTime() - 1);
            for (const startAt of [edgeStart, edgeAlmostEnd]) {
              if (!isEligibleFinal(tick, startAt, offsetMs, tz)) {
                continue;
              }
              if (!isInUtcCandidateWindow(tick, startAt, offsetMs)) {
                counterexamples.push(
                  `edge tick=${tick.toISOString()} tz=${tz} startAt=${startAt.toISOString()}`,
                );
              }
            }
          }
        }
      }
    }

    expect(counterexamples).toEqual([]);
  });

  it('UTC candidate window equals final window when timezone is UTC', () => {
    const tickAt = new Date('2026-08-01T12:34:56.000Z');
    for (const offsetMs of OFFSETS) {
      const utcFinal = computeReminderStartAtWindow(
        tickAt,
        offsetMs,
        APPOINTMENT_REMINDER_TIMEZONE_FALLBACK,
      );
      const candidate = computeReminderStartAtWindowUtc(tickAt, offsetMs);
      expect(candidate.windowStart.toISOString()).toBe(
        utcFinal.windowStart.toISOString(),
      );
      expect(candidate.windowEnd.toISOString()).toBe(
        utcFinal.windowEnd.toISOString(),
      );
    }
  });

  it('appointments outside final window are never selected by UTC candidate (converse)', () => {
    const tickAt = new Date('2026-11-01T06:15:30.000Z');
    const tz = 'America/New_York';
    const offsetMs = APPOINTMENT_REMINDER_24H_OFFSET_MS;
    const { windowStart, windowEnd } = computeReminderStartAtWindow(
      tickAt,
      offsetMs,
      tz,
    );
    const before = new Date(windowStart.getTime() - 60_000);
    const after = new Date(windowEnd.getTime());
    expect(isEligibleFinal(tickAt, before, offsetMs, tz)).toBe(false);
    expect(isEligibleFinal(tickAt, after, offsetMs, tz)).toBe(false);
    expect(isInUtcCandidateWindow(tickAt, before, offsetMs)).toBe(false);
    expect(isInUtcCandidateWindow(tickAt, after, offsetMs)).toBe(false);
  });

  it('DST fall-back local minute may span more than 60s UTC but eligible startAt still in UTC candidate', () => {
    const tickAt = new Date('2026-11-01T05:30:00.000Z');
    const tz = 'America/New_York';
    const offsetMs = APPOINTMENT_REMINDER_1H_OFFSET_MS;
    const tzWindow = computeReminderStartAtWindow(tickAt, offsetMs, tz);
    const utcWindow = computeReminderStartAtWindowUtc(tickAt, offsetMs);
    const tzSpanMs =
      tzWindow.windowEnd.getTime() - tzWindow.windowStart.getTime();
    const utcSpanMs =
      utcWindow.windowEnd.getTime() - utcWindow.windowStart.getTime();
    expect(utcSpanMs).toBe(60_000);
    expect(tzSpanMs).toBeGreaterThanOrEqual(60_000);

    const midStartAt = new Date(
      tzWindow.windowStart.getTime() +
        Math.floor(tzSpanMs / 2),
    );
    expect(isEligibleFinal(tickAt, midStartAt, offsetMs, tz)).toBe(true);
    expect(isInUtcCandidateWindow(tickAt, midStartAt, offsetMs)).toBe(true);
  });

  it('Asia/Kathmandu (+5:45) eligible appointments are captured by UTC candidate scan', () => {
    const tickAt = new Date('2026-05-10T04:14:30.000Z');
    const tz = 'Asia/Kathmandu';
    const offsetMs = APPOINTMENT_REMINDER_24H_OFFSET_MS;
    const { windowStart, windowEnd } = computeReminderStartAtWindow(
      tickAt,
      offsetMs,
      tz,
    );
    expect(
      isInUtcCandidateWindow(tickAt, windowStart, offsetMs),
    ).toBe(true);
    const inner = new Date(windowStart.getTime() + 30_000);
    expect(isEligibleFinal(tickAt, inner, offsetMs, tz)).toBe(true);
    expect(isInUtcCandidateWindow(tickAt, inner, offsetMs)).toBe(true);
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(60_000);
  });

  it('year 2026 hourly scan: timezone startAt window always within UTC candidate window', () => {
    const start = DateTime.fromISO('2026-01-01T00:00:00.000Z', { zone: 'UTC' });
    for (let hour = 0; hour < 8760; hour += 1) {
      const tickAt = start.plus({ hours: hour }).toJSDate();
      for (const tz of TIMEZONES) {
        for (const offsetMs of OFFSETS) {
          const tzW = computeReminderStartAtWindow(tickAt, offsetMs, tz);
          const utcW = computeReminderStartAtWindowUtc(tickAt, offsetMs);
          expect(tzW.windowStart.getTime()).toBeGreaterThanOrEqual(
            utcW.windowStart.getTime(),
          );
          expect(tzW.windowEnd.getTime()).toBeLessThanOrEqual(
            utcW.windowEnd.getTime(),
          );
        }
      }
    }
  });

  it('proves superset relation symbolically: UTC candidate window covers TZ window start boundary', () => {
    for (const tz of TIMEZONES) {
      for (const iso of [
        '2026-03-08T07:15:00.000Z',
        '2026-11-01T05:45:00.000Z',
        '2026-06-15T10:00:30.000Z',
      ]) {
        const tickAt = new Date(iso);
        for (const offsetMs of OFFSETS) {
          const tzW = computeReminderStartAtWindow(tickAt, offsetMs, tz);
          const utcW = computeReminderStartAtWindowUtc(tickAt, offsetMs);
          expect(tzW.windowStart.getTime()).toBeGreaterThanOrEqual(
            utcW.windowStart.getTime(),
          );
          expect(tzW.windowEnd.getTime()).toBeLessThanOrEqual(
            utcW.windowEnd.getTime(),
          );
        }
      }
    }
  });
});
