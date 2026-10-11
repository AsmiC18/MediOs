import { BadRequestException } from '@nestjs/common';
import {
  assertAdvanceBookingWindow,
  assertCancellationWindow,
  assertMaximumAdvanceBooking,
  assertMinimumAdvanceBooking,
  schedulingBufferedIntervalsConflict,
} from './scheduling-booking-policy.util';

describe('scheduling-booking-policy.util', () => {
  const now = new Date('2026-10-01T10:00:00.000Z');

  describe('minimum advance', () => {
    it('rejects before boundary', () => {
      expect(() =>
        assertMinimumAdvanceBooking(
          new Date('2026-10-01T10:59:00.000Z'),
          60,
          now,
        ),
      ).toThrow(BadRequestException);
    });

    it('accepts exact boundary', () => {
      expect(() =>
        assertMinimumAdvanceBooking(
          new Date('2026-10-01T11:00:00.000Z'),
          60,
          now,
        ),
      ).not.toThrow();
    });

    it('accepts after boundary', () => {
      expect(() =>
        assertMinimumAdvanceBooking(
          new Date('2026-10-01T11:01:00.000Z'),
          60,
          now,
        ),
      ).not.toThrow();
    });
  });

  describe('maximum advance', () => {
    it('accepts before boundary', () => {
      expect(() =>
        assertMaximumAdvanceBooking(
          new Date('2026-10-31T09:59:00.000Z'),
          43_200,
          now,
        ),
      ).not.toThrow();
    });

    it('accepts exact boundary', () => {
      expect(() =>
        assertMaximumAdvanceBooking(
          new Date('2026-10-31T10:00:00.000Z'),
          43_200,
          now,
        ),
      ).not.toThrow();
    });

    it('rejects after boundary', () => {
      expect(() =>
        assertMaximumAdvanceBooking(
          new Date('2026-10-31T10:01:00.000Z'),
          43_200,
          now,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('cancellation window', () => {
    const startAt = new Date('2026-10-01T15:00:00.000Z');

    it('allows before boundary', () => {
      expect(() =>
        assertCancellationWindow(startAt, 120, new Date('2026-10-01T12:59:00.000Z')),
      ).not.toThrow();
    });

    it('allows exact boundary', () => {
      expect(() =>
        assertCancellationWindow(startAt, 120, new Date('2026-10-01T13:00:00.000Z')),
      ).not.toThrow();
    });

    it('rejects inside prohibited window', () => {
      expect(() =>
        assertCancellationWindow(startAt, 120, new Date('2026-10-01T13:01:00.000Z')),
      ).toThrow(BadRequestException);
    });
  });

  describe('buffer conflict', () => {
    const existingStart = new Date('2026-10-01T10:00:00.000Z');
    const existingEnd = new Date('2026-10-01T10:30:00.000Z');

    it('allows adjacent appointments with buffer 0', () => {
      expect(
        schedulingBufferedIntervalsConflict(
          existingStart,
          existingEnd,
          new Date('2026-10-01T10:30:00.000Z'),
          new Date('2026-10-01T11:00:00.000Z'),
          0,
        ),
      ).toBe(false);
    });

    it('rejects adjacent appointments with positive buffer', () => {
      expect(
        schedulingBufferedIntervalsConflict(
          existingStart,
          existingEnd,
          new Date('2026-10-01T10:30:00.000Z'),
          new Date('2026-10-01T11:00:00.000Z'),
          15,
        ),
      ).toBe(true);
    });

    it('accepts exact buffer boundary', () => {
      expect(
        schedulingBufferedIntervalsConflict(
          existingStart,
          existingEnd,
          new Date('2026-10-01T10:45:00.000Z'),
          new Date('2026-10-01T11:15:00.000Z'),
          15,
        ),
      ).toBe(false);
    });

    it('checks reverse ordering', () => {
      const laterStart = new Date('2026-10-01T10:45:00.000Z');
      const laterEnd = new Date('2026-10-01T11:15:00.000Z');
      expect(
        schedulingBufferedIntervalsConflict(
          laterStart,
          laterEnd,
          new Date('2026-10-01T10:00:00.000Z'),
          new Date('2026-10-01T10:30:00.000Z'),
          15,
        ),
      ).toBe(false);
    });
  });

  describe('assertAdvanceBookingWindow', () => {
    it('combines min and max', () => {
      expect(() =>
        assertAdvanceBookingWindow(
          new Date('2026-10-01T11:00:00.000Z'),
          { minimumAdvanceMinutes: 60, maximumAdvanceMinutes: 43_200 },
          now,
        ),
      ).not.toThrow();
    });
  });
});
