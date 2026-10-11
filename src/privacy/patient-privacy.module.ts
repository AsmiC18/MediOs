import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { PatientPrivacyController } from './patient-privacy.controller';
import { PatientPrivacyConsentService } from './patient-privacy-consent.service';
import { PatientPrivacyErasureService } from './patient-privacy-erasure.service';
import { PatientPrivacyExportService } from './patient-privacy-export.service';

@Module({
  imports: [CommonModule, AuditModule, JobModule, ClinicalModule],
  controllers: [PatientPrivacyController],
  providers: [
    PatientPrivacyConsentService,
    PatientPrivacyExportService,
    PatientPrivacyErasureService,
  ],
  exports: [
    PatientPrivacyConsentService,
    PatientPrivacyExportService,
    PatientPrivacyErasureService,
  ],
})
export class PatientPrivacyModule {}
