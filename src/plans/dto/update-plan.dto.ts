import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
