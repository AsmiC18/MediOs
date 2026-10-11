import { InsuranceClaimStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';

export class InsuranceAgeingQueryDto extends ReportDateRangeDto {
  @IsEnum(InsuranceClaimStatus)
  @IsOptional()
  status?: InsuranceClaimStatus;
}
