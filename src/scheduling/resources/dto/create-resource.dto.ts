import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ResourceType } from '@prisma/client';

export class CreateResourceDto {
  @IsEnum(ResourceType)
  type: ResourceType;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  branchId?: string;
}
