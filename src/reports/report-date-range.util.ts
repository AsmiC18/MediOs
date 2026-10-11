import { BadRequestException } from '@nestjs/common';

export const MAX_REPORT_RANGE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseReportDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid date for ${field}`);
  }
  return date;
}

/** Shared from/to rules for report filters (inclusive from, exclusive to — matches audit logs). */
export function assertValidReportDateRange(from: string, to: string): void {
  const fromDate = parseReportDate(from, 'from');
  const toDate = parseReportDate(to, 'to');

  if (fromDate.getTime() > toDate.getTime()) {
    throw new BadRequestException('from must be less than or equal to to');
  }

  const spanMs = toDate.getTime() - fromDate.getTime();
  if (spanMs > MAX_REPORT_RANGE_DAYS * MS_PER_DAY) {
    throw new BadRequestException(
      `Date range exceeds the maximum of ${MAX_REPORT_RANGE_DAYS} days`,
    );
  }
}
