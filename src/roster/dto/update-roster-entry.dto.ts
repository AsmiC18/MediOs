import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateRosterEntryDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'shiftStartTime must be a valid HH:mm time',
  })
  @IsOptional()
  shiftStartTime?: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'shiftEndTime must be a valid HH:mm time',
  })
  @IsOptional()
  shiftEndTime?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
