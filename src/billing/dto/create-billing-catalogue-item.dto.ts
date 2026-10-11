import { BillingCatalogueItemType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBillingCatalogueItemDto {
  @IsEnum(BillingCatalogueItemType)
  itemType!: BillingCatalogueItemType;

  @IsString()
  @MaxLength(32)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  hsnSac?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  pharmacyProductId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
