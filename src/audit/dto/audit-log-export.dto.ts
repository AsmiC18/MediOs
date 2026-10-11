import { IsEnum } from 'class-validator';
import { AuditLogFiltersDto } from './audit-log-filters.dto';

export enum AuditLogExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class AuditLogExportDto extends AuditLogFiltersDto {
  @IsEnum(AuditLogExportFormat)
  format!: AuditLogExportFormat;
}
