import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  DiagnosticOrderPriority,
  DiagnosticOrderStatus,
} from '@prisma/client';

export class DiagnosticOrderQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  encounterId?: string;

  @IsEnum(DiagnosticOrderStatus)
  @IsOptional()
  status?: DiagnosticOrderStatus;

  @IsEnum(DiagnosticOrderPriority)
  @IsOptional()
  priority?: DiagnosticOrderPriority;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  date?: string;
}
