import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBatchDto {
  @IsUUID()
  productId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  batchNumber: string;

  @IsDateString()
  expiryDate: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sellingPrice?: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class UpdateBatchDto {
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  sellingPrice?: number;
}

export class BatchQueryDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
