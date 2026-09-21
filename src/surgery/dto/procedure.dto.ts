import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateProcedureRecordDto {
  @IsUUID()
  surgeonUserId: string;

  @IsUUID()
  @IsOptional()
  assistantUserId?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  procedureNotes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  findings?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  complications?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  outcome?: string;
}

export class UpdateProcedureRecordDto {
  @IsUUID()
  @IsOptional()
  assistantUserId?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  procedureNotes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  findings?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  complications?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  outcome?: string;
}
