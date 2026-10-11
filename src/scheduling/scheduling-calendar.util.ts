import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  getLocalTimeMinutes,
  parseHHmmToMinutes,
} from '../attendance/attendance-shift.util';

export type LocalShiftWindow = {
  startTime: string;
  endTime: string;
  timezone: string;
};

/**
 * RosterEntry.date is stored as UTC midnight of the local calendar Y-M-D
 * (see RosterService.normalizeRosterDate).
 */
export function rosterDateFromInstant(instant: Date, timezone: string): Date {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  const safe = local.isValid ? local : DateTime.fromJSDate(instant, { zone: 'UTC' });
  return new Date(Date.UTC(safe.year, safe.month - 1, safe.day));
}

export function localDateStringFromInstant(
  instant: Date,
  timezone: string,
): string {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  const safe = local.isValid ? local : DateTime.fromJSDate(instant, { zone: 'UTC' });
  return safe.toISODate() ?? '';
}

/**
 * Inclusive boundaries: start >= windowStart and end <= windowEnd (local clock).
 * Appointment must fall on a single local calendar day. Overnight shifts are not supported.
 */
export function assertAppointmentWithinLocalShift(
  startAt: Date,
  endAt: Date,
  window: LocalShiftWindow,
): void {
  const timezone = window.timezone?.trim() || 'UTC';
  const startMinutes = getLocalTimeMinutes(startAt, timezone);
  const endMinutes = getLocalTimeMinutes(endAt, timezone);

  if (startMinutes === null || endMinutes === null) {
    throw new BadRequestException('Invalid timezone for scheduling validation.');
  }

  const startLocal = DateTime.fromJSDate(startAt, { zone: timezone });
  const endLocal = DateTime.fromJSDate(endAt, { zone: timezone });
  const safeStart = startLocal.isValid ? startLocal : DateTime.fromJSDate(startAt, { zone: 'UTC' });
  const safeEnd = endLocal.isValid ? endLocal : DateTime.fromJSDate(endAt, { zone: 'UTC' });

  if (safeStart.toISODate() !== safeEnd.toISODate()) {
    throw new BadRequestException(
      'Appointment must start and end on the same local calendar day for the configured shift.',
    );
  }

  const windowStartMinutes = parseHHmmToMinutes(window.startTime);
  const windowEndMinutes = parseHHmmToMinutes(window.endTime);

  if (windowStartMinutes >= windowEndMinutes) {
    throw new BadRequestException(
      'Overnight shifts are not supported for appointment scheduling.',
    );
  }

  if (startMinutes < windowStartMinutes) {
    throw new BadRequestException(
      'Appointment starts before configured working hours.',
    );
  }

  if (endMinutes > windowEndMinutes) {
    throw new BadRequestException(
      'Appointment ends after configured working hours.',
    );
  }
}

export function isAppointmentWithinLocalShift(
  startAt: Date,
  endAt: Date,
  window: LocalShiftWindow,
): boolean {
  try {
    assertAppointmentWithinLocalShift(startAt, endAt, window);
    return true;
  } catch {
    return false;
  }
}

export function localDaySlotBounds(
  localDateIso: string,
  schedule: LocalShiftWindow,
): { windowStartUtc: Date; windowEndUtc: Date; timezone: string } | null {
  const timezone = schedule.timezone?.trim() || 'UTC';
  const dayStart = DateTime.fromISO(localDateIso, { zone: timezone }).startOf('day');
  if (!dayStart.isValid) {
    return null;
  }

  const workStartMinutes = parseHHmmToMinutes(schedule.startTime);
  const workEndMinutes = parseHHmmToMinutes(schedule.endTime);
  if (workStartMinutes >= workEndMinutes) {
    return null;
  }

  const windowStartLocal = dayStart.plus({ minutes: workStartMinutes });
  const windowEndLocal = dayStart.plus({ minutes: workEndMinutes });

  return {
    windowStartUtc: windowStartLocal.toUTC().toJSDate(),
    windowEndUtc: windowEndLocal.toUTC().toJSDate(),
    timezone,
  };
}
