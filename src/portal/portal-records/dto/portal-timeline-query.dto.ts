import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  Validate,
} from 'class-validator';
import {
  PatientTimelineCategory,
  PatientTimelineDateRangeConstraint,
  PatientTimelineQueryDto,
} from '../../../patients/dto/patient-timeline-query.dto';

export class PortalTimelineQueryDto implements Pick<
  PatientTimelineQueryDto,
  'page' | 'limit' | 'from' | 'to' | 'category'
> {
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
}
