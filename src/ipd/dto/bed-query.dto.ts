import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BedStatus, BedType } from '@prisma/client';

export class BedQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  wardName?: string;

  @IsEnum(BedStatus)
  @IsOptional()
  status?: BedStatus;

  @IsEnum(BedType)
  @IsOptional()
  bedType?: BedType;
}
