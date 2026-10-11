import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateBillingCatalogueItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  hsnSac?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
