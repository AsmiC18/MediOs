import { SurgeryPriority } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSurgeryRequestDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  encounterId: string;

  @IsUUID()
  @IsOptional()
  admissionId?: string;

  @IsUUID()
  @IsOptional()
  preAuthorizationId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  procedureName: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  procedureCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  indication?: string;

  @IsEnum(SurgeryPriority)
  @IsOptional()
  priority?: SurgeryPriority;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  notes?: string;
}

export class SurgeryRequestQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  encounterId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  priority?: string;
}

export class CancelSurgeryRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  cancellationReason: string;
}
