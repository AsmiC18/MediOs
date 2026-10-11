import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DispensingItemDto {
  @IsUUID()
  prescriptionItemId: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  prescribedProductId?: string;

  @IsString()
  @IsOptional()
  substitutionReason?: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class CreateDispensingDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  prescriptionId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispensingItemDto)
  items: DispensingItemDto[];
}

export class DispensingQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  prescriptionId?: string;
}
