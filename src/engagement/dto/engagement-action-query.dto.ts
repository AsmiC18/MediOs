import { PatientEngagementActionStatus, PatientEngagementActionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class EngagementActionQueryDto {
  @IsOptional()
  @IsEnum(PatientEngagementActionStatus)
  status?: PatientEngagementActionStatus;

  @IsOptional()
  @IsEnum(PatientEngagementActionType)
  type?: PatientEngagementActionType;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
