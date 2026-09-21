import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AbdmRegistrationStatus } from '@prisma/client';

export class UpdateAbdmProfessionalDto {
  @IsString()
  @IsOptional()
  hprId?: string;

  @IsEnum(AbdmRegistrationStatus)
  @IsOptional()
  linkStatus?: AbdmRegistrationStatus;
}
