import { SurgeryPreOpFitnessStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePreOpAssessmentDto {
  @IsEnum(SurgeryPreOpFitnessStatus)
  fitnessStatus: SurgeryPreOpFitnessStatus;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  notes?: string;
}
