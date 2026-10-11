import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobHandlerRegistry } from '../job-handler.registry';
import { JOB_TYPES } from '../job-types.constants';
import { PaymentReconciliationJobHandler } from '../../billing/payment-reconciliation.job-handler';
import { RefundReconciliationJobHandler } from '../../billing/refund-reconciliation.job-handler';
import { NotificationDispatchJobHandler } from '../../notifications/notification-dispatch.job-handler';
import { AbdmConsentExpireHandler } from './abdm-consent-expire.handler';
import { StaffAttendanceConsultationJobHandler } from '../../billing/staff-attendance-consultation.job-handler';
import { PatientAtRiskEvaluateHandler } from './patient-at-risk-evaluate.handler';
import { PrivacyRetentionPurgeHandler } from './privacy-retention-purge.handler';
import { AttendanceMonthlySummaryHandler } from '../../attendance/attendance-monthly-summary.handler';
import { InsuranceClaimAgeingJobHandler } from '../../insurance/insurance-claim-ageing.job-handler';
import { InsuranceClaimRetryJobHandler } from '../../insurance/insurance-claim-retry.job-handler';
import { InsuranceClaimSubmitJobHandler } from '../../insurance/insurance-claim-submit.job-handler';
import { InsuranceReconciliationJobHandler } from '../../insurance/insurance-reconciliation.job-handler';
import { PharmacyDispensingBillingJobHandler } from '../../billing/pharmacy-dispensing-billing.job-handler';
import { PharmacyExpiryScanHandler } from '../../pharmacy/jobs/pharmacy-expiry-scan.handler';
import { PharmacyLowStockScanHandler } from '../../pharmacy/jobs/pharmacy-low-stock-scan.handler';
import { DiagnosticAggregatorSubmitJobHandler } from '../../diagnostics/diagnostic-aggregator-submit.job-handler';
import { DepartmentBillingJobHandler } from '../../billing/department/department-billing.job-handler';
import { PharmacyPrescriptionProcessJobHandler } from '../../pharmacy/jobs/pharmacy-prescription-process.job-handler';
import { PatientPrivacyErasureHandler } from './patient-privacy-erasure.handler';
import { PatientNpsTriggerHandler } from './patient-nps-trigger.handler';
import { PatientWinbackHandler } from './patient-winback.handler';
import { ReportProjectionRefreshJobHandler } from '../../reports/report-projection-refresh.job-handler';

@Injectable()
export class JobHandlerRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly abdmConsentExpireHandler: AbdmConsentExpireHandler,
    private readonly paymentReconciliationJobHandler: PaymentReconciliationJobHandler,
    private readonly refundReconciliationJobHandler: RefundReconciliationJobHandler,
    private readonly notificationDispatchJobHandler: NotificationDispatchJobHandler,
    private readonly privacyRetentionPurgeHandler: PrivacyRetentionPurgeHandler,
    private readonly patientAtRiskEvaluateHandler: PatientAtRiskEvaluateHandler,
    private readonly staffAttendanceConsultationJobHandler: StaffAttendanceConsultationJobHandler,
    private readonly attendanceMonthlySummaryHandler: AttendanceMonthlySummaryHandler,
    private readonly insuranceClaimSubmitJobHandler: InsuranceClaimSubmitJobHandler,
    private readonly insuranceClaimRetryJobHandler: InsuranceClaimRetryJobHandler,
    private readonly insuranceClaimAgeingJobHandler: InsuranceClaimAgeingJobHandler,
    private readonly insuranceReconciliationJobHandler: InsuranceReconciliationJobHandler,
    private readonly pharmacyDispensingBillingJobHandler: PharmacyDispensingBillingJobHandler,
    private readonly pharmacyLowStockScanHandler: PharmacyLowStockScanHandler,
    private readonly pharmacyExpiryScanHandler: PharmacyExpiryScanHandler,
    private readonly diagnosticAggregatorSubmitJobHandler: DiagnosticAggregatorSubmitJobHandler,
    private readonly departmentBillingJobHandler: DepartmentBillingJobHandler,
    private readonly pharmacyPrescriptionProcessJobHandler: PharmacyPrescriptionProcessJobHandler,
    private readonly patientPrivacyErasureHandler: PatientPrivacyErasureHandler,
    private readonly patientNpsTriggerHandler: PatientNpsTriggerHandler,
    private readonly patientWinbackHandler: PatientWinbackHandler,
    private readonly reportProjectionRefreshJobHandler: ReportProjectionRefreshJobHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(JOB_TYPES.ABDM_CONSENT_EXPIRE, async (job, context) => {
      await this.abdmConsentExpireHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.BILLING_PAYMENT_RECONCILE, async (job, context) => {
      await this.paymentReconciliationJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.BILLING_REFUND_RECONCILE, async (job, context) => {
      await this.refundReconciliationJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.NOTIFICATION_DISPATCH, async (job, context) => {
      await this.notificationDispatchJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PRIVACY_RETENTION_PURGE, async (job, context) => {
      await this.privacyRetentionPurgeHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PATIENT_AT_RISK_EVALUATE, async (job, context) => {
      await this.patientAtRiskEvaluateHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.STAFF_ATTENDANCE_CONSULTATION, async (job, context) => {
      await this.staffAttendanceConsultationJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.ATTENDANCE_MONTHLY_SUMMARY, async (job, context) => {
      await this.attendanceMonthlySummaryHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.INSURANCE_CLAIM_SUBMIT, async (job, context) => {
      await this.insuranceClaimSubmitJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.INSURANCE_CLAIM_RETRY, async (job, context) => {
      await this.insuranceClaimRetryJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.INSURANCE_CLAIM_AGEING, async (job, context) => {
      await this.insuranceClaimAgeingJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.INSURANCE_RECONCILIATION, async (job, context) => {
      await this.insuranceReconciliationJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PHARMACY_DISPENSING_BILLING, async (job, context) => {
      await this.pharmacyDispensingBillingJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PHARMACY_LOW_STOCK_SCAN, async (job, context) => {
      await this.pharmacyLowStockScanHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PHARMACY_EXPIRY_SCAN, async (job, context) => {
      await this.pharmacyExpiryScanHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.DIAGNOSTIC_AGGREGATOR_SUBMIT, async (job, context) => {
      await this.diagnosticAggregatorSubmitJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.BILLING_DEPARTMENT_PROCESS, async (job, context) => {
      await this.departmentBillingJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PHARMACY_PRESCRIPTION_PROCESS, async (job, context) => {
      await this.pharmacyPrescriptionProcessJobHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PATIENT_PRIVACY_ERASURE, async (job, context) => {
      await this.patientPrivacyErasureHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PATIENT_NPS_TRIGGER, async (job, context) => {
      await this.patientNpsTriggerHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.PATIENT_WINBACK, async (job, context) => {
      await this.patientWinbackHandler.handle(job, context);
    });
    this.registry.register(JOB_TYPES.REPORT_PROJECTION_REFRESH, async (job, context) => {
      await this.reportProjectionRefreshJobHandler.handle(job, context);
    });
  }
}
