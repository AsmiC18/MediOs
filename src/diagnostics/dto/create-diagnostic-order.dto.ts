import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DiagnosticOrderPriority } from '@prisma/client';

export class DiagnosticTestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  testCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  testName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  specimenType: string;
}

export class CreateDiagnosticOrderDto {
  @IsString()
  encounterId: string;

  @IsEnum(DiagnosticOrderPriority)
  @IsOptional()
  priority?: DiagnosticOrderPriority;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DiagnosticTestDto)
  tests: DiagnosticTestDto[];
}
