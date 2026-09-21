import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePostOpRecordDto {
  @IsString()
  @IsOptional()
  @MaxLength(4096)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  followUpInstructions?: string;

  @IsDateString()
  @IsOptional()
  recordedAt?: string;
}

export class UpdatePostOpRecordDto {
  @IsString()
  @IsOptional()
  @MaxLength(4096)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  followUpInstructions?: string;

  @IsDateString()
  @IsOptional()
  recordedAt?: string;
}
