import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateLeaveDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
