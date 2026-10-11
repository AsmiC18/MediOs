import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

export enum PatientTimelineCategory {
  APPOINTMENT = 'appointment',
  PRESCRIPTION = 'prescription',
  INVOICE = 'invoice',
  DIAGNOSTIC = 'diagnostic',
  INSURANCE_CLAIM = 'insurance_claim',
}

@ValidatorConstraint({ name: 'PatientTimelineDateRange', async: false })
export class PatientTimelineDateRangeConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as PatientTimelineQueryDto;
    if (!obj.from && !obj.to) {
      return true;
    }
    if (!obj.from || !obj.to) {
      return false;
    }
    const fromDate = new Date(obj.from);
    const toDate = new Date(obj.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return false;
    }
    return fromDate.getTime() <= toDate.getTime();
  }

  defaultMessage(): string {
    return 'from and to must both be valid ISO dates with from <= to';
  }
}

export class PatientTimelineQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @Validate(PatientTimelineDateRangeConstraint)
  private readonly _dateRangeGuard?: undefined;

  @IsEnum(PatientTimelineCategory)
  @IsOptional()
  category?: PatientTimelineCategory;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
