import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  genericName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  strength?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  dosageForm?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  unit: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  sku?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  reorderLevel?: number;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  genericName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  strength?: string;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  dosageForm?: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(64)
  unit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  sku?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  reorderLevel?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ProductQueryDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  search?: string;
}
