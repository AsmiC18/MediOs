import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AbdmConsentJobModule } from '../abdm/abdm-consent-job.module';
import { BillingReconciliationJobModule } from '../billing/billing-reconciliation-job.module';
import { StaffAttendanceConsultationJobModule } from '../billing/staff-attendance-consultation-job.module';
import { AttendanceJobModule } from '../attendance/attendance-job.module';
import { NotificationJobModule } from '../notifications/notification-job.module';
import { CommonModule } from '../common/common.module';
import { PatientsJobModule } from '../patients/patients-job.module';
import { InsuranceJobModule } from '../insurance/insurance-job.module';
import { PharmacyDispensingBillingJobModule } from '../billing/pharmacy-dispensing-billing-job.module';
import { DepartmentBillingJobModule } from '../billing/department/department-billing-job.module';
import { PharmacyPrescriptionProcessJobModule } from '../pharmacy/jobs/pharmacy-prescription-process-job.module';
import { PharmacyInventoryJobModule } from '../pharmacy/jobs/pharmacy-inventory-job.module';
import { DiagnosticsJobModule } from '../diagnostics/diagnostics-job.module';
import { PrivacyRetentionJobModule } from '../privacy/privacy-retention-job.module';
import { ReportsJobModule } from '../reports/reports-job.module';
import { ReportProjectionRefreshJobHandler } from '../reports/report-projection-refresh.job-handler';
import { PatientPrivacyJobModule } from '../privacy/patient-privacy-job.module';
import { EngagementJobModule } from '../engagement/engagement-job.module';
import { PatientPrivacyErasureHandler } from '../jobs/handlers/patient-privacy-erasure.handler';
import { PatientNpsTriggerHandler } from '../jobs/handlers/patient-nps-trigger.handler';
import { PatientWinbackHandler } from '../jobs/handlers/patient-winback.handler';
import { AbdmConsentExpireHandler } from '../jobs/handlers/abdm-consent-expire.handler';
import { PatientAtRiskEvaluateHandler } from '../jobs/handlers/patient-at-risk-evaluate.handler';
import { StaffAttendanceConsultationJobHandler } from '../billing/staff-attendance-consultation.job-handler';
import { AttendanceMonthlySummaryHandler } from '../attendance/attendance-monthly-summary.handler';
import { PrivacyRetentionPurgeHandler } from '../jobs/handlers/privacy-retention-purge.handler';
import { JobHandlerRegistrar } from '../jobs/handlers/job-handler.registrar';
import { PharmacyDispensingBillingJobHandler } from '../billing/pharmacy-dispensing-billing.job-handler';
import { PharmacyExpiryScanHandler } from '../pharmacy/jobs/pharmacy-expiry-scan.handler';
import { PharmacyLowStockScanHandler } from '../pharmacy/jobs/pharmacy-low-stock-scan.handler';
import { DiagnosticAggregatorSubmitJobHandler } from '../diagnostics/diagnostic-aggregator-submit.job-handler';
import { DepartmentBillingJobHandler } from '../billing/department/department-billing.job-handler';
import { PharmacyPrescriptionProcessJobHandler } from '../pharmacy/jobs/pharmacy-prescription-process.job-handler';
import { JobHandlerRegistry } from '../jobs/job-handler.registry';
import { JobModule } from '../jobs/job.module';
import { JobWorkerService } from '../jobs/job-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    JobModule,
    AbdmConsentJobModule,
    BillingReconciliationJobModule,
    StaffAttendanceConsultationJobModule,
    AttendanceJobModule,
    NotificationJobModule,
    PrivacyRetentionJobModule,
    PatientPrivacyJobModule,
    EngagementJobModule,
    PatientsJobModule,
    InsuranceJobModule,
    PharmacyDispensingBillingJobModule,
    PharmacyInventoryJobModule,
    DiagnosticsJobModule,
    DepartmentBillingJobModule,
    PharmacyPrescriptionProcessJobModule,
    ReportsJobModule,
  ],
  providers: [
    ReportProjectionRefreshJobHandler,
    JobHandlerRegistry,
    JobWorkerService,
    AbdmConsentExpireHandler,
    PatientAtRiskEvaluateHandler,
    StaffAttendanceConsultationJobHandler,
    AttendanceMonthlySummaryHandler,
    PrivacyRetentionPurgeHandler,
    PatientPrivacyErasureHandler,
    PatientNpsTriggerHandler,
    PatientWinbackHandler,
    JobHandlerRegistrar,
    PharmacyDispensingBillingJobHandler,
    PharmacyLowStockScanHandler,
    PharmacyExpiryScanHandler,
    DiagnosticAggregatorSubmitJobHandler,
    DepartmentBillingJobHandler,
    PharmacyPrescriptionProcessJobHandler,
  ],
  exports: [JobHandlerRegistry, JobWorkerService],
})
export class WorkerModule {}
