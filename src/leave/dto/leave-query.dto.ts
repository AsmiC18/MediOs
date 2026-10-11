import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { LeaveStatus } from '@prisma/client';

export class LeaveQueryDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsEnum(LeaveStatus)
  @IsOptional()
  status?: LeaveStatus;
}
