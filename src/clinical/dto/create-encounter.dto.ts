import { ClinicalEncounterType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateEncounterDto {
  @IsUUID()
  patientId: string;

  @IsEnum(ClinicalEncounterType)
  encounterType: ClinicalEncounterType;

  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @IsUUID()
  @IsOptional()
  ipdAdmissionId?: string;
}
