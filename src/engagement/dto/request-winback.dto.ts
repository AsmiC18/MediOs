import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestWinbackDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
