import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePreAuthorizationDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  policyId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  admissionId?: string;

  @IsUUID()
  @IsOptional()
  encounterId?: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  requestedAmount: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

export class ApprovePreAuthorizationDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  approvedAmount: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  authorizationNumber?: string;
}

export class RejectPreAuthorizationDto {
  @IsString()
  @Min(1)
  @MaxLength(2000)
  rejectionReason: string;
}

export class PreAuthorizationQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
