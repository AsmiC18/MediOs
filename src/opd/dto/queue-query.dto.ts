import { IsEnum, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { OpdQueuePriority, OpdQueueStatus } from '@prisma/client';

export class QueueQueryDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsEnum(OpdQueueStatus)
  @IsOptional()
  status?: OpdQueueStatus;

  @IsEnum(OpdQueuePriority)
  @IsOptional()
  priority?: OpdQueuePriority;

  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @IsUUID()
  @IsOptional()
  patientId?: string;
}
