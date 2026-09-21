import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ResourceStatus } from '@prisma/client';

export class UpdateResourceDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ResourceStatus)
  @IsOptional()
  status?: ResourceStatus;

  @IsString()
  @IsOptional()
  branchId?: string;
}
