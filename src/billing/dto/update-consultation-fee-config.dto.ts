import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateConsultationFeeConfigDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice!: number;

  @IsString()
  @IsOptional()
  hsnSac?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  gstRate?: number;
}
