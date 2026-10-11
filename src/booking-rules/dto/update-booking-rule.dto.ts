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

  @IsInt()
  @Min(0)
  @IsOptional()
  minimumAdvanceMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maximumAdvanceMinutes?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  cancellationWindowMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  bufferMinutes?: number;
}
