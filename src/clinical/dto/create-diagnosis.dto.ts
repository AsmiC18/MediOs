import { ClinicalDiagnosisType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDiagnosisDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsEnum(ClinicalDiagnosisType)
  @IsOptional()
  diagnosisType?: ClinicalDiagnosisType;
}
