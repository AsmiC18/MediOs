import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { HSN_SAC_PATTERN } from '../utils/gst.util';

export class CreateInvoiceItemDto {
  @IsOptional()
  @IsUUID()
  billingCatalogueItemId?: string;

  @ValidateIf((item: CreateInvoiceItemDto) => !item.billingCatalogueItemId)
  @IsString()
  @IsNotEmpty()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ValidateIf((item: CreateInvoiceItemDto) => !item.billingCatalogueItemId)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ValidateIf(
    (item: CreateInvoiceItemDto) =>
      !item.billingCatalogueItemId && (item.gstRate ?? 0) > 0,
  )
  @IsString()
  @IsNotEmpty()
  @Matches(HSN_SAC_PATTERN, {
    message: 'hsnSac must be 4 to 8 alphanumeric characters',
  })
  hsnSac?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  gstRate?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
