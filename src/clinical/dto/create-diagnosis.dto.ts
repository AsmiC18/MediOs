import { ClinicalDiagnosisType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDiagnosisDto {
  @IsString()
  @MinLength(1)
  code: string;

  /** Ignored when persisting; authoritative description comes from the ICD-10 catalogue. */
  @IsString()
  @MinLength(1)
  @IsOptional()
  description?: string;

  @IsEnum(ClinicalDiagnosisType)
  @IsOptional()
  diagnosisType?: ClinicalDiagnosisType;
}
