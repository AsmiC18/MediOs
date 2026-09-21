import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AbdmConsentStatus } from '@prisma/client';

export class UpdateConsentStatusDto {
  @IsEnum(AbdmConsentStatus)
  status: AbdmConsentStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
