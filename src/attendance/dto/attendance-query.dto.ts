import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class AttendanceQueryDto {
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @IsDateString()
  @IsOptional()
  toDate?: string;
}
