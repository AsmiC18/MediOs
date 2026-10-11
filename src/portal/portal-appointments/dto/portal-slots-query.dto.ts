import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class PortalSlotsQueryDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  resourceIds!: string[];

  @IsDateString()
  date!: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
