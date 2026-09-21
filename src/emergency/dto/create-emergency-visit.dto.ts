import { EmergencyPriority } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmergencyVisitDto {
  @IsUUID()
  patientId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  chiefComplaint: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsEnum(EmergencyPriority)
  priority: EmergencyPriority;

  @IsUUID()
  @IsOptional()
  branchId?: string;
}
