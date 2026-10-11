import { BadRequestException } from '@nestjs/common';
import { assertValidReportDateRange } from './report-date-range.util';

describe('assertValidReportDateRange', () => {
  it('accepts a valid range within 90 days', () => {
    expect(() =>
      assertValidReportDateRange(
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T00:00:00.000Z',
      ),
    ).not.toThrow();
  });

  it('accepts exactly 90 days span', () => {
    expect(() =>
      assertValidReportDateRange(
        '2026-01-01T00:00:00.000Z',
        '2026-04-01T00:00:00.000Z',
      ),
    ).not.toThrow();
  });

  it('rejects from after to', () => {
    expect(() =>
      assertValidReportDateRange(
        '2026-02-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid dates', () => {
    expect(() =>
      assertValidReportDateRange('not-a-date', '2026-01-02T00:00:00.000Z'),
    ).toThrow(BadRequestException);
  });

  it('rejects range greater than 90 days', () => {
    expect(() =>
      assertValidReportDateRange(
        '2026-01-01T00:00:00.000Z',
        '2026-04-02T00:00:00.000Z',
      ),
    ).toThrow(/maximum of 90 days/);
  });
});
