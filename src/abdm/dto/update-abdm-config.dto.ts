import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AbdmRegistrationStatus } from '@prisma/client';

export class UpdateAbdmConfigDto {
  @IsString()
  @IsOptional()
  hfrId?: string;

  @IsString()
  @IsOptional()
  hipId?: string;

  @IsString()
  @IsOptional()
  hiuId?: string;

  @IsString()
  @IsOptional()
  bridgeId?: string;

  @IsString()
  @IsOptional()
  callbackBaseUrl?: string;

  @IsEnum(AbdmRegistrationStatus)
  @IsOptional()
  hfrStatus?: AbdmRegistrationStatus;

  @IsEnum(AbdmRegistrationStatus)
  @IsOptional()
  hipStatus?: AbdmRegistrationStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
