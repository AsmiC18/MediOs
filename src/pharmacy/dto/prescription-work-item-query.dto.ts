import { PharmacyPrescriptionWorkItemStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class PrescriptionWorkItemQueryDto {
  @IsEnum(PharmacyPrescriptionWorkItemStatus)
  @IsOptional()
  status?: PharmacyPrescriptionWorkItemStatus;

  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  prescriptionId?: string;

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
