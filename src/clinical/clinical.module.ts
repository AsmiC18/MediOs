import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { ClinicalDiagnosisController } from './clinical-diagnosis.controller';
import { ClinicalEncounterController } from './clinical-encounter.controller';
import { ClinicalPrescriptionController } from './clinical-prescription.controller';
import { ClinicalService } from './clinical.service';
import { PatientClinicalController } from './patient-clinical.controller';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [
    ClinicalEncounterController,
    ClinicalDiagnosisController,
    ClinicalPrescriptionController,
    PatientClinicalController,
  ],
  providers: [ClinicalService],
  exports: [ClinicalService],
})
export class ClinicalModule {}
