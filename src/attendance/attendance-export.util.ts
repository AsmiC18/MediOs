export type AttendancePayrollExportRow = {
  hospitalId: string;
  branchId: string | null;
  userId: string;
  staffEmail: string | null;
  staffName: string;
  periodYear: number;
  periodMonth: number;
  presentDays: number;
  lateDays: number;
  halfDayDays: number;
  absentDays: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
};

export function serializeAttendancePayrollToCsv(
  rows: AttendancePayrollExportRow[],
): string {
  const header = [
    'hospitalId',
    'branchId',
    'userId',
    'staffEmail',
    'staffName',
    'periodYear',
    'periodMonth',
    'presentDays',
    'lateDays',
    'halfDayDays',
    'absentDays',
    'totalLateMinutes',
    'totalEarlyLeaveMinutes',
  ].join(',');

  const lines = rows.map((row) =>
    [
      row.hospitalId,
      row.branchId ?? '',
      row.userId,
      row.staffEmail ?? '',
      escapeCsv(row.staffName),
      row.periodYear,
      row.periodMonth,
      row.presentDays,
      row.lateDays,
      row.halfDayDays,
      row.absentDays,
      row.totalLateMinutes,
      row.totalEarlyLeaveMinutes,
    ].join(','),
  );

  return [header, ...lines].join('\n');
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
