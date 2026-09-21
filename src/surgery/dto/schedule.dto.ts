import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ScheduleSurgeryDto {
  @IsUUID()
  resourceId: string;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class SurgeryScheduleQueryDto {
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @IsUUID()
  @IsOptional()
  resourceId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
