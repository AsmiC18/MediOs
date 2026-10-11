import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AttendanceSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  periodYear!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
