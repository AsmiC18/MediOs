import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class EvaluateAtRiskDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  cadenceMultiplier?: number;
}
