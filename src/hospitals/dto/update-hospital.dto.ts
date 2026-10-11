import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateHospitalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  gstin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  stateCode?: string | null;
}
