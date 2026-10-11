import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
