import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Gender, PatientAtRiskStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';

export class PatientQueryDto {
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @Transform(({ value }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isAtRisk?: boolean;

  @IsEnum(PatientAtRiskStatus)
  @IsOptional()
  atRiskStatus?: PatientAtRiskStatus;

  @IsString()
  @IsOptional()
  abhaId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
