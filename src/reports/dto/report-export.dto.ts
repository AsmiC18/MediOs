import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReportDateRangeDto } from './report-date-range.dto';

export enum ReportExportType {
  FINANCIAL = 'financial',
  GST = 'gst',
  INSURANCE_AGEING = 'insurance_ageing',
  PHARMACY_SALES = 'pharmacy_sales',
  PHARMACY_INVENTORY = 'pharmacy_inventory',
  PHARMACY_SHRINK = 'pharmacy_shrink',
  OPD_METRICS = 'opd_metrics',
  IPD_OCCUPANCY = 'ipd_occupancy',
  DOCTOR_PERFORMANCE = 'doctor_performance',
  ATTENDANCE_SUMMARY = 'attendance_summary',
  DAILY_DASHBOARD = 'daily_dashboard',
  DEPARTMENT_REVENUE = 'department_revenue',
  PATIENT_COHORT = 'patient_cohort',
  ABDM_ADOPTION = 'abdm_adoption',
}

export enum ReportExportFormat {
  CSV = 'csv',
  JSON = 'json',
  PDF = 'pdf',
}

export class ReportExportDto extends ReportDateRangeDto {
  @IsEnum(ReportExportType)
  type!: ReportExportType;

  @IsEnum(ReportExportFormat)
  format!: ReportExportFormat;

  /** Required when type is attendance_summary */
  @IsOptional()
  @IsInt()
  @Min(2000)
  periodYear?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  /** Required when type is ipd_occupancy */
  @IsOptional()
  asOf?: string;
}
