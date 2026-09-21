import { InsuranceEmpanelmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateEmpanelmentDto {
  @IsUUID()
  providerId: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  referenceNumber?: string;

  @IsDateString()
  effectiveFrom: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateEmpanelmentDto {
  @IsEnum(InsuranceEmpanelmentStatus)
  @IsOptional()
  status?: InsuranceEmpanelmentStatus;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

export class EmpanelmentQueryDto {
  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsEnum(InsuranceEmpanelmentStatus)
  @IsOptional()
  status?: InsuranceEmpanelmentStatus;
}
