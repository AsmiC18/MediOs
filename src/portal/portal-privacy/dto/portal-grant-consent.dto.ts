import { IsEnum } from 'class-validator';
import { PatientPrivacyPurpose } from '@prisma/client';

export class PortalGrantConsentDto {
  @IsEnum(PatientPrivacyPurpose)
  purpose!: PatientPrivacyPurpose;
}
