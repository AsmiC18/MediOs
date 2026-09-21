import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { BedType } from '@prisma/client';

export class CreateBedDto {
  @IsUUID()
  branchId: string;

  @IsString()
  @MinLength(1)
  wardName: string;

  @IsString()
  @MinLength(1)
  roomNumber: string;

  @IsString()
  @MinLength(1)
  bedNumber: string;

  @IsEnum(BedType)
  @IsOptional()
  bedType?: BedType;

  @IsString()
  @IsOptional()
  notes?: string;
}
