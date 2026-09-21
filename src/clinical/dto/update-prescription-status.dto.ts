import { PrescriptionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePrescriptionStatusDto {
  @IsEnum(PrescriptionStatus)
  status: PrescriptionStatus;
}
