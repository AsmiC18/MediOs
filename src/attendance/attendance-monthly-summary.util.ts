import { Attendance, AttendanceStatus } from '@prisma/client';

export type UtcCalendarMonth = {
  periodYear: number;
  periodMonth: number;
  periodStart: Date;
  periodEndExclusive: Date;
  periodKey: string;
};

/** Previous completed UTC calendar month relative to reference (default now). */
export function resolvePreviousUtcCalendarMonth(
  reference: Date = new Date(),
): UtcCalendarMonth {
  const year = reference.getUTCFullYear();
  const monthIndex = reference.getUTCMonth();
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const periodMonth = prevMonthIndex + 1;

  const periodStart = new Date(Date.UTC(prevYear, prevMonthIndex, 1));
  const periodEndExclusive = new Date(Date.UTC(year, monthIndex, 1));

  return {
    periodYear: prevYear,
    periodMonth,
    periodStart,
    periodEndExclusive,
    periodKey: `${prevYear}-${String(periodMonth).padStart(2, '0')}`,
  };
}

export type AttendanceMonthlyAggregate = {
  totalAttendanceDays: number;
  presentDays: number;
  lateDays: number;
  halfDayDays: number;
  absentDays: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
};

export function aggregateAttendanceRows(
  rows: Pick<
    Attendance,
    'status' | 'lateMinutes' | 'earlyLeaveMinutes'
  >[],
): AttendanceMonthlyAggregate {
  let presentDays = 0;
  let lateDays = 0;
  let halfDayDays = 0;
  let absentDays = 0;
  let totalLateMinutes = 0;
  let totalEarlyLeaveMinutes = 0;

  for (const row of rows) {
    switch (row.status) {
      case AttendanceStatus.PRESENT:
        presentDays += 1;
        break;
      case AttendanceStatus.LATE:
        lateDays += 1;
        break;
      case AttendanceStatus.HALF_DAY:
        halfDayDays += 1;
        break;
      case AttendanceStatus.ABSENT:
        absentDays += 1;
        break;
      default:
        break;
    }

    totalLateMinutes += row.lateMinutes;
    totalEarlyLeaveMinutes += row.earlyLeaveMinutes;
  }

  return {
    totalAttendanceDays: rows.length,
    presentDays,
    lateDays,
    halfDayDays,
    absentDays,
    totalLateMinutes,
    totalEarlyLeaveMinutes,
  };
}

export function monthlySummaryJobIdempotencyKey(
  hospitalId: string,
  periodKey: string,
): string {
  return `attendance.monthly.summary:${hospitalId}:${periodKey}`;
}
