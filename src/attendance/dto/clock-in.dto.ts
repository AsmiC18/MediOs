import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ClockInDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLongitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationLabel?: string;
}
