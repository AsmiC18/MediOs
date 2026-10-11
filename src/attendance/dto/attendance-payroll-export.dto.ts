import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum AttendancePayrollExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class AttendancePayrollExportDto {
  @IsInt()
  @Min(2000)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;

  @IsEnum(AttendancePayrollExportFormat)
  format!: AttendancePayrollExportFormat;

  @IsString()
  @IsOptional()
  branchId?: string;
}
