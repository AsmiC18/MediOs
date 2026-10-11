import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
