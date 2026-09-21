import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AbdmConsentStatus } from '@prisma/client';

export class CreateConsentDto {
  @IsString()
  @MinLength(1)
  purpose: string;

  @IsArray()
  @IsString({ each: true })
  hiTypes: string[];

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsEnum(AbdmConsentStatus)
  @IsOptional()
  status?: AbdmConsentStatus;
}
