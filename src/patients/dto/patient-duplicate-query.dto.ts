import { IsOptional, IsString, MinLength } from 'class-validator';

export class PatientDuplicateQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
