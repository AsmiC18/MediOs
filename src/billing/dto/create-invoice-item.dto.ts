import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateInvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @ValidateIf((item: CreateInvoiceItemDto) => (item.gstRate ?? 0) > 0)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9A-Za-z]{4,8}$/, {
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
