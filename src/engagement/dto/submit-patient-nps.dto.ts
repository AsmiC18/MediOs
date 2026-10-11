import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_NPS_COMMENT_LENGTH } from '../patient-engagement.constants';

export class SubmitPatientNpsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NPS_COMMENT_LENGTH)
  comment?: string;
}
