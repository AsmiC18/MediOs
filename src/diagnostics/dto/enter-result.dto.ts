import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DiagnosticResultFlag } from '@prisma/client';

export class EnterResultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  resultValue: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  resultUnit?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  referenceRange?: string;

  @IsEnum(DiagnosticResultFlag)
  @IsOptional()
  resultFlag?: DiagnosticResultFlag;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  resultNotes?: string;
}
