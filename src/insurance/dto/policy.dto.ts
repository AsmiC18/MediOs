import { PatientInsurancePolicyStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePolicyDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  providerId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  policyNumber: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  memberId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  groupNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  planName?: string;

  @IsDateString()
  @IsOptional()
  coverageStartDate?: string;

  @IsDateString()
  @IsOptional()
  coverageEndDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sumInsured?: number;
}

export class UpdatePolicyDto {
  @IsEnum(PatientInsurancePolicyStatus)
  @IsOptional()
  status?: PatientInsurancePolicyStatus;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  memberId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  groupNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  planName?: string;

  @IsDateString()
  @IsOptional()
  coverageEndDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sumInsured?: number;
}

export class PolicyQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsEnum(PatientInsurancePolicyStatus)
  @IsOptional()
  status?: PatientInsurancePolicyStatus;
}
