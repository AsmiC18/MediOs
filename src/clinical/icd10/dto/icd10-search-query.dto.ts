import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class Icd10SearchQueryDto {
  @IsString()
  @MinLength(1)
  q: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
