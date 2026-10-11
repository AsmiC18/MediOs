import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { PatientPrivacyErasureService } from './patient-privacy-erasure.service';
import { PatientPrivacyExportService } from './patient-privacy-export.service';
import { PatientPrivacyConsentService } from './patient-privacy-consent.service';

@Module({
  imports: [CommonModule, AuditModule, JobModule, ClinicalModule],
  providers: [
    PatientPrivacyConsentService,
    PatientPrivacyExportService,
    PatientPrivacyErasureService,
  ],
  exports: [PatientPrivacyErasureService],
})
export class PatientPrivacyJobModule {}
