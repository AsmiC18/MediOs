import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PrescriptionItemDto {
  @IsString()
  @IsOptional()
  clinicalDrugId?: string;

  @IsString()
  @MinLength(1)
  medicationName: string;

  @IsString()
  @IsOptional()
  dosage?: string;

  @IsString()
  @IsOptional()
  route?: string;

  @IsString()
  @IsOptional()
  frequency?: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}

export class SafetyOverrideDto {
  @IsArray()
  @IsString({ each: true })
  findingKeys: string[];

  @IsString()
  @MinLength(1)
  reason: string;
}

export class CreatePrescriptionDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SafetyOverrideDto)
  safetyOverrides?: SafetyOverrideDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
