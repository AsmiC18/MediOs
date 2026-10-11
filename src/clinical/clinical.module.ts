import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';

import { CommonModule } from '../common/common.module';

import { JobModule } from '../jobs/job.module';

import { NotificationsModule } from '../notifications/notifications.module';

import { DRUG_INTERACTION_ADAPTER } from './adapters/drug-interaction.adapter';

import { UnavailableDrugInteractionAdapter } from './adapters/unavailable-drug-interaction.adapter';

import { ClinicalDiagnosisController } from './clinical-diagnosis.controller';
import { Icd10Controller } from './icd10/icd10.controller';
import { Icd10Service } from './icd10/icd10.service';

import { ClinicalEncounterController } from './clinical-encounter.controller';

import { ClinicalPrescriptionController } from './clinical-prescription.controller';

import { ClinicalService } from './clinical.service';

import { ClinicalDrugService } from './drugs/clinical-drug.service';

import { ClinicalPrescriptionOutboxService } from './events/clinical-prescription-outbox.service';

import { PatientClinicalController } from './patient-clinical.controller';

import { ClinicalSafetyPolicyService } from './safety/clinical-safety-policy.service';

import { PrescriptionSafetyService } from './safety/prescription-safety.service';
import { ClinicalAttachmentController } from './attachments/clinical-attachment.controller';
import { ClinicalEncounterAttachmentController } from './attachments/clinical-encounter-attachment.controller';
import { ClinicalAttachmentService } from './attachments/clinical-attachment.service';
import {
  CLINICAL_BLOB_STORAGE_ADAPTER,
} from './attachments/storage/clinical-blob-storage.adapter';
import { LocalClinicalBlobStorageAdapter } from './attachments/storage/local-clinical-blob-storage.adapter';
import { ClinicalDrugController } from './drugs/clinical-drug.controller';

@Module({
  imports: [CommonModule, AuditModule, NotificationsModule, JobModule],
  controllers: [
    ClinicalEncounterController,
    ClinicalDiagnosisController,
    Icd10Controller,
    ClinicalPrescriptionController,
    PatientClinicalController,
    ClinicalDrugController,
    ClinicalEncounterAttachmentController,
    ClinicalAttachmentController,
  ],
  providers: [
    ClinicalService,
    Icd10Service,
    ClinicalDrugService,
    ClinicalSafetyPolicyService,
    PrescriptionSafetyService,
    ClinicalPrescriptionOutboxService,
    ClinicalAttachmentService,
    LocalClinicalBlobStorageAdapter,
    {
      provide: CLINICAL_BLOB_STORAGE_ADAPTER,
      useExisting: LocalClinicalBlobStorageAdapter,
    },
    {
      provide: DRUG_INTERACTION_ADAPTER,
      useClass: UnavailableDrugInteractionAdapter,
    },
  ],
  exports: [
    ClinicalService,
    Icd10Service,
    ClinicalAttachmentService,
    CLINICAL_BLOB_STORAGE_ADAPTER,
    LocalClinicalBlobStorageAdapter,
  ],
})
export class ClinicalModule {}


