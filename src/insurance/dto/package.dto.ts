import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInsurancePackageDto {
  @IsUUID()
  providerId: string;

  @IsUUID()
  empanelmentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;
}

export class UpdateInsurancePackageDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateInsurancePackageRateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  serviceCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  serviceName: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rate: number;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  currency?: string;

  @IsDateString()
  effectiveFrom: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;
}

export class UpdateInsurancePackageRateDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(256)
  serviceName?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  rate?: number;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;
}

export class PackageQueryDto {
  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsUUID()
  @IsOptional()
  empanelmentId?: string;
}
