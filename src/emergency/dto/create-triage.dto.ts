import { EmergencyPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTriageDto {
  @IsEnum(EmergencyPriority)
  priority: EmergencyPriority;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  temperature?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  heartRate?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  respiratoryRate?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  systolicBp?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  diastolicBp?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  oxygenSaturation?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  painScore?: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  consciousness?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
