import { InsuranceClaimStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClaimDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  policyId: string;

  @IsUUID()
  invoiceId: string;

  @IsUUID()
  @IsOptional()
  preAuthorizationId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}

export class ApproveClaimDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  approvedAmount: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  patientResponsibility?: number;
}

export class RejectClaimDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  rejectionReason: string;
}

export class RecordClaimPaymentDto {
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  paidAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class ClaimQueryDto {
  @IsEnum(InsuranceClaimStatus)
  @IsOptional()
  status?: InsuranceClaimStatus;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsUUID()
  @IsOptional()
  policyId?: string;

  @IsUUID()
  @IsOptional()
  invoiceId?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  minAgeDays?: number;
}
