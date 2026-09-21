import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BedStatus, BedType } from '@prisma/client';

export class UpdateBedDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  wardName?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  roomNumber?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  bedNumber?: string;

  @IsEnum(BedType)
  @IsOptional()
  bedType?: BedType;

  @IsEnum(BedStatus)
  @IsOptional()
  status?: BedStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
