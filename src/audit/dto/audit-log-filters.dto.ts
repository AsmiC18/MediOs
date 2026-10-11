import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/** Shared I1/I2 audit log filters (tenant scope applied in service). */
export class AuditLogFiltersDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  /** Exact action match (not full-text). */
  @IsString()
  @IsOptional()
  action?: string;

  /** Exact entity match (not full-text). */
  @IsString()
  @IsOptional()
  entity?: string;

  @IsUUID()
  @IsOptional()
  entityId?: string;

  /** Inclusive lower bound on createdAt (ISO 8601). */
  @IsDateString()
  @IsOptional()
  from?: string;

  /** Exclusive upper bound on createdAt (ISO 8601). */
  @IsDateString()
  @IsOptional()
  to?: string;
}
