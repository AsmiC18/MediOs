import { AttendanceStatus } from '@prisma/client';
import {
  calculateLateMinutes,
  parseHHmmToMinutes,
} from './attendance-shift.util';

describe('attendance-shift.util', () => {
  it('uses roster shift times for late calculation when provided', () => {
    const timezone = 'Asia/Kolkata';
    const clockIn = new Date('2026-01-15T04:00:00.000Z');
    const late = calculateLateMinutes(clockIn, '09:30', timezone);
    expect(late).toBe(0);
  });

  it('calculates late minutes after shift start', () => {
    const timezone = 'UTC';
    const clockIn = new Date('2026-01-15T09:20:00.000Z');
    expect(calculateLateMinutes(clockIn, '09:00', timezone)).toBe(20);
  });

  it('parses HH:mm to minutes', () => {
    expect(parseHHmmToMinutes('09:15')).toBe(555);
  });
});

describe('attendance arrival status', () => {
  it('maps late minutes to LATE vs PRESENT', () => {
    const resolve = (lateMinutes: number) =>
      lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
    expect(resolve(0)).toBe(AttendanceStatus.PRESENT);
    expect(resolve(1)).toBe(AttendanceStatus.LATE);
  });
});
