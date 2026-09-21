import { EmergencyPriority, EmergencyVisitStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class EmergencyVisitQueryDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsEnum(EmergencyVisitStatus)
  @IsOptional()
  status?: EmergencyVisitStatus;

  @IsEnum(EmergencyPriority)
  @IsOptional()
  priority?: EmergencyPriority;

  @IsUUID()
  @IsOptional()
  patientId?: string;
}
