import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IpdAdmissionStatus } from '@prisma/client';

export class AdmissionQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsEnum(IpdAdmissionStatus)
  @IsOptional()
  status?: IpdAdmissionStatus;
}
