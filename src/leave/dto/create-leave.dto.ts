import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeaveDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
