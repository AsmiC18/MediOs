import {
  IsDateString,
  IsOptional,
  IsUUID,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { assertValidReportDateRange } from '../report-date-range.util';

@ValidatorConstraint({ name: 'ReportDateRange', async: false })
export class ReportDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as ReportDateRangeDto;
    if (!obj.from || !obj.to) {
      return true;
    }
    try {
      assertValidReportDateRange(obj.from, obj.to);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as ReportDateRangeDto;
    if (!obj.from || !obj.to) {
      return 'Invalid report date range';
    }
    const fromDate = new Date(obj.from);
    const toDate = new Date(obj.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return 'Invalid date for from or to';
    }
    if (fromDate.getTime() > toDate.getTime()) {
      return 'from must be less than or equal to to';
    }
    const spanMs = toDate.getTime() - fromDate.getTime();
    const maxMs = 90 * 24 * 60 * 60 * 1000;
    if (spanMs > maxMs) {
      return 'Date range exceeds the maximum of 90 days';
    }
    return 'Invalid report date range';
  }
}

export class ReportDateRangeDto {
  @IsDateString()
  @Validate(ReportDateRangeConstraint)
  from!: string;

  @IsDateString()
  to!: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
