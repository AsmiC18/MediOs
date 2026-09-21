import { InsuranceProviderType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string;

  @IsEnum(InsuranceProviderType)
  providerType: InsuranceProviderType;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  contactName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;
}

export class UpdateProviderDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  code?: string;

  @IsEnum(InsuranceProviderType)
  @IsOptional()
  providerType?: InsuranceProviderType;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  contactName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  contactPhone?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
