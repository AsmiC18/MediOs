import { PharmacyPurchaseOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PurchaseOrderItemInputDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items!: PurchaseOrderItemInputDto[];
}

export class UpdateDraftPurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInputDto)
  items?: PurchaseOrderItemInputDto[];
}

export class CancelPurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReceiveStockLineDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  batchNumber!: string;

  @IsDateString()
  expiryDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class ReceiveStockDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockLineDto)
  lines!: ReceiveStockLineDto[];
}

export class PurchaseOrderQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(PharmacyPurchaseOrderStatus)
  status?: PharmacyPurchaseOrderStatus;
}
