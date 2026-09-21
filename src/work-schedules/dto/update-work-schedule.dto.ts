import { IsOptional, IsString, Matches } from 'class-validator';

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateWorkScheduleDto {
  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'workStartTime must be a valid HH:mm time',
  })
  @IsOptional()
  workStartTime?: string;

  @IsString()
  @Matches(HH_MM_PATTERN, {
    message: 'workEndTime must be a valid HH:mm time',
  })
  @IsOptional()
  workEndTime?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}
