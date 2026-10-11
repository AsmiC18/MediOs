import { BadRequestException } from '@nestjs/common';
import { BookingRule } from '@prisma/client';

export const BOOKING_TOO_SOON_MESSAGE =
  'Appointment start time is earlier than the minimum advance booking window.';
export const BOOKING_TOO_FAR_MESSAGE =
  'Appointment start time is beyond the maximum advance booking window.';
export const CANCELLATION_WINDOW_CLOSED_MESSAGE =
  'Cancellation is no longer allowed this close to the appointment start time.';

/** Maximum configurable advance/cancellation/buffer minutes (365 days). */
export const BOOKING_POLICY_MAX_MINUTES = 525_600;

export function assertBookingRuleDuration(
  startAt: Date,
  endAt: Date,
  rule: BookingRule,
): void {
  const durationMinutes = Math.round(
    (endAt.getTime() - startAt.getTime()) / 60000,
  );

  if (durationMinutes < rule.minDurationMinutes) {
    throw new BadRequestException(
      `Appointment duration must be at least ${rule.minDurationMinutes} minutes.`,
    );
  }

  if (durationMinutes > rule.maxDurationMinutes) {
    throw new BadRequestException(
      `Appointment duration must not exceed ${rule.maxDurationMinutes} minutes.`,
    );
  }

  if (durationMinutes % rule.slotDurationMinutes !== 0) {
    throw new BadRequestException(
      `Appointment duration must be a multiple of ${rule.slotDurationMinutes} minutes.`,
    );
  }
}

/**
 * Earliest allowed start: now + minimumAdvanceMinutes (inclusive).
 * Example: now 10:00, min 60 → 11:00 allowed, 10:59 rejected.
 */
export function assertMinimumAdvanceBooking(
  startAt: Date,
  minimumAdvanceMinutes: number,
  now: Date,
): void {
  if (minimumAdvanceMinutes <= 0) {
    return;
  }

  const earliestMs = now.getTime() + minimumAdvanceMinutes * 60_000;
  if (startAt.getTime() < earliestMs) {
    throw new BadRequestException(BOOKING_TOO_SOON_MESSAGE);
  }
}

/**
 * Latest allowed start: now + maximumAdvanceMinutes (inclusive).
 * Null maximumAdvanceMinutes means unlimited.
 */
export function assertMaximumAdvanceBooking(
  startAt: Date,
  maximumAdvanceMinutes: number | null | undefined,
  now: Date,
): void {
  if (maximumAdvanceMinutes == null) {
    return;
  }

  const latestMs = now.getTime() + maximumAdvanceMinutes * 60_000;
  if (startAt.getTime() > latestMs) {
    throw new BadRequestException(BOOKING_TOO_FAR_MESSAGE);
  }
}

export function assertAdvanceBookingWindow(
  startAt: Date,
  rule: Pick<
    BookingRule,
    'minimumAdvanceMinutes' | 'maximumAdvanceMinutes'
  >,
  now: Date,
): void {
  assertMinimumAdvanceBooking(startAt, rule.minimumAdvanceMinutes, now);
  assertMaximumAdvanceBooking(startAt, rule.maximumAdvanceMinutes, now);
}

/**
 * Cancellation allowed while startAt - now >= cancellationWindowMinutes (inclusive at boundary).
 * Example: start 15:00, window 120 → cancel allowed until 13:00 inclusive; 13:01 rejected.
 */
export function assertCancellationWindow(
  appointmentStartAt: Date,
  cancellationWindowMinutes: number,
  now: Date,
): void {
  if (cancellationWindowMinutes <= 0) {
    return;
  }

  const remainingMs = appointmentStartAt.getTime() - now.getTime();
  const requiredMs = cancellationWindowMinutes * 60_000;
  if (remainingMs < requiredMs) {
    throw new BadRequestException(CANCELLATION_WINDOW_CLOSED_MESSAGE);
  }
}

/**
 * Buffer-aware resource conflict: blocks when appointments are closer than bufferMinutes apart.
 * buffer=0 uses standard half-open overlap (touching allowed).
 */
export function schedulingBufferedIntervalsConflict(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  bufferMinutes: number,
): boolean {
  if (bufferMinutes <= 0) {
    return aStart < bEnd && aEnd > bStart;
  }

  const bufferMs = bufferMinutes * 60_000;
  return aStart < new Date(bEnd.getTime() + bufferMs) &&
    new Date(aEnd.getTime() + bufferMs) > bStart;
}

export function buildBufferedConflictTimeBounds(
  startAt: Date,
  endAt: Date,
  bufferMinutes: number,
): { startUpper: Date; endLower: Date } {
  const bufferMs = Math.max(0, bufferMinutes) * 60_000;
  return {
    startUpper: new Date(endAt.getTime() + bufferMs),
    endLower: new Date(startAt.getTime() - bufferMs),
  };
}
