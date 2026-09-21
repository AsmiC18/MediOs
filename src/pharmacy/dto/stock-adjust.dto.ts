import { PharmacyStockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class StockAdjustDto {
  @IsUUID()
  batchId: string;

  @IsEnum(PharmacyStockMovementType)
  movementType: PharmacyStockMovementType;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  reason?: string;
}
