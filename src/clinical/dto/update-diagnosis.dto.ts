import { ClinicalDiagnosisType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDiagnosisDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  code?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  description?: string;

  @IsEnum(ClinicalDiagnosisType)
  @IsOptional()
  diagnosisType?: ClinicalDiagnosisType;
}
