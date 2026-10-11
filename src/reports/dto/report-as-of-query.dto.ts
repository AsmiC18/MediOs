import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** Point-in-time report filters (e.g. IPD occupancy). No 90-day span rule. */
export class ReportAsOfQueryDto {
  @IsDateString()
  asOf!: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
