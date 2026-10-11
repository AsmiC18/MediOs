import { BadRequestException } from '@nestjs/common';
import {
  assertAppointmentWithinLocalShift,
  rosterDateFromInstant,
} from './scheduling-calendar.util';

describe('scheduling-calendar.util', () => {
  const window = {
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'Asia/Kolkata',
  };

  it('allows appointment fully inside work schedule', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T04:30:00.000Z'),
        new Date('2026-10-08T05:00:00.000Z'),
        window,
      ),
    ).not.toThrow();
  });

  it('rejects appointment starting before work schedule', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T03:29:00.000Z'),
        new Date('2026-10-08T04:00:00.000Z'),
        window,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects appointment ending after work schedule', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T11:15:00.000Z'),
        new Date('2026-10-08T11:31:00.000Z'),
        window,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows exact opening boundary', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T03:30:00.000Z'),
        new Date('2026-10-08T04:00:00.000Z'),
        window,
      ),
    ).not.toThrow();
  });

  it('allows exact closing boundary', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T11:00:00.000Z'),
        new Date('2026-10-08T11:30:00.000Z'),
        window,
      ),
    ).not.toThrow();
  });

  it('rejects appointment crossing closing boundary', () => {
    expect(() =>
      assertAppointmentWithinLocalShift(
        new Date('2026-10-08T11:00:00.000Z'),
        new Date('2026-10-08T11:31:00.000Z'),
        window,
      ),
    ).toThrow(BadRequestException);
  });

  it('uses timezone for roster date lookup across UTC midnight', () => {
    const instant = new Date('2026-10-08T23:30:00.000Z');
    const rosterDate = rosterDateFromInstant(instant, 'Asia/Kolkata');
    expect(rosterDate.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });
});
