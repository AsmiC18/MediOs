import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateBookingRuleDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  minDurationMinutes?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxDurationMinutes?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  slotDurationMinutes?: number;
}
