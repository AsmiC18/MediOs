import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualClaimSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
