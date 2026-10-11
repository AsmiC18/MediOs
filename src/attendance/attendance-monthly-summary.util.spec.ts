import { AttendanceStatus } from '@prisma/client';
import {
  aggregateAttendanceRows,
  monthlySummaryJobIdempotencyKey,
  resolvePreviousUtcCalendarMonth,
} from './attendance-monthly-summary.util';

describe('attendance-monthly-summary.util', () => {
  it('resolves previous UTC calendar month', () => {
    const period = resolvePreviousUtcCalendarMonth(
      new Date('2026-03-05T12:00:00.000Z'),
    );
    expect(period.periodKey).toBe('2026-02');
    expect(period.periodYear).toBe(2026);
    expect(period.periodMonth).toBe(2);
  });

  it('aggregates attendance statuses', () => {
    const result = aggregateAttendanceRows([
      {
        status: AttendanceStatus.PRESENT,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
      },
      {
        status: AttendanceStatus.LATE,
        lateMinutes: 12,
        earlyLeaveMinutes: 5,
      },
    ]);

    expect(result.presentDays).toBe(1);
    expect(result.lateDays).toBe(1);
    expect(result.totalLateMinutes).toBe(12);
    expect(result.totalEarlyLeaveMinutes).toBe(5);
    expect(result.totalAttendanceDays).toBe(2);
  });

  it('uses deterministic monthly job idempotency key', () => {
    expect(monthlySummaryJobIdempotencyKey('h1', '2026-02')).toBe(
      'attendance.monthly.summary:h1:2026-02',
    );
  });
});
