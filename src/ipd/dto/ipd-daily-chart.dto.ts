import { IpdDailyChartEntryType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateIpdDailyChartEntryDto {
  @IsEnum(IpdDailyChartEntryType)
  entryType!: IpdDailyChartEntryType;

  @IsOptional()
  @IsISO8601()
  recordedAt?: string;

  @ValidateIf((o) => o.entryType === IpdDailyChartEntryType.VITAL)
  @IsObject()
  vitalsJson?: Record<string, unknown>;

  @ValidateIf((o) => o.entryType === IpdDailyChartEntryType.NOTE)
  @IsString()
  @MaxLength(8000)
  noteText?: string;
}
