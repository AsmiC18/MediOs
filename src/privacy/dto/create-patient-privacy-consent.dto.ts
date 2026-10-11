import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PatientPrivacyPurpose } from '@prisma/client';

export class CreatePatientPrivacyConsentDto {
  @IsEnum(PatientPrivacyPurpose)
  purpose!: PatientPrivacyPurpose;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;
}
