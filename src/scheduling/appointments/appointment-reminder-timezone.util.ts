import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';

export const APPOINTMENT_REMINDER_TIMEZONE_FALLBACK = 'UTC';

/**
 * Branch WorkSchedule → Hospital default WorkSchedule → UTC.
 * Uses branch.hospitalId scoping; does not pick arbitrary WorkSchedule rows.
 */
export async function resolveAppointmentReminderTimezone(
  transaction: Prisma.TransactionClient,
  input: { hospitalId: string; branchId: string | null },
): Promise<string> {
  if (input.branchId) {
    const branch = await transaction.branch.findFirst({
      where: {
        id: input.branchId,
        hospitalId: input.hospitalId,
      },
      select: {
        workSchedule: {
          select: { timezone: true },
        },
      },
    });
    const branchTz = branch?.workSchedule?.timezone?.trim();
    if (branchTz) {
      return branchTz;
    }
  }

  const hospital = await transaction.hospital.findFirst({
    where: { id: input.hospitalId },
    select: {
      defaultWorkSchedule: {
        select: { timezone: true },
      },
    },
  });
  const hospitalTz = hospital?.defaultWorkSchedule?.timezone?.trim();
  if (hospitalTz) {
    return hospitalTz;
  }

  return APPOINTMENT_REMINDER_TIMEZONE_FALLBACK;
}

/**
 * Reminder due instant = appointment.startAt - offset (elapsed ms).
 * Due is eligible when it falls in the scheduler tick's local minute (in timezone).
 * Maps that due minute to the corresponding appointment.startAt window.
 */
export function computeReminderStartAtWindow(
  tickAt: Date,
  offsetMs: number,
  timezone: string,
): { windowStart: Date; windowEnd: Date } {
  const zone = timezone?.trim() || APPOINTMENT_REMINDER_TIMEZONE_FALLBACK;
  const localTick = DateTime.fromJSDate(tickAt, { zone });
  const safeTick = localTick.isValid ? localTick : DateTime.fromJSDate(tickAt, { zone: 'UTC' });
  const localMinuteStart = safeTick.startOf('minute');
  const localMinuteEnd = localMinuteStart.plus({ minutes: 1 });
  const utcDueStart = localMinuteStart.toUTC();
  const utcDueEnd = localMinuteEnd.toUTC();
  return {
    windowStart: new Date(utcDueStart.toMillis() + offsetMs),
    windowEnd: new Date(utcDueEnd.toMillis() + offsetMs),
  };
}

/** Elapsed-hour due instant (UTC storage); timezone does not shift the appointment. */
export function computeReminderDueInstant(
  appointmentStartAt: Date,
  offsetMs: number,
): Date {
  return new Date(appointmentStartAt.getTime() - offsetMs);
}

export function isReminderDueInTimezoneTickWindow(
  dueInstant: Date,
  tickAt: Date,
  timezone: string,
): boolean {
  const zone = timezone?.trim() || APPOINTMENT_REMINDER_TIMEZONE_FALLBACK;
  const localTick = DateTime.fromJSDate(tickAt, { zone });
  const safeTick = localTick.isValid ? localTick : DateTime.fromJSDate(tickAt, { zone: 'UTC' });
  const localMinuteStart = safeTick.startOf('minute');
  const localMinuteEnd = localMinuteStart.plus({ minutes: 1 });
  const due = DateTime.fromJSDate(dueInstant, { zone: 'UTC' });
  return due >= localMinuteStart.toUTC() && due < localMinuteEnd.toUTC();
}
