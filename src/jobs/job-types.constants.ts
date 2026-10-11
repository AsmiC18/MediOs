/** Production and infrastructure job type identifiers. */
export const JOB_TYPES = {
  ABDM_CONSENT_EXPIRE: 'abdm.consent.expire',
  BILLING_PAYMENT_RECONCILE: 'billing.payment.reconcile',
  BILLING_REFUND_RECONCILE: 'billing.refund.reconcile',
  NOTIFICATION_DISPATCH: 'notification.dispatch',
  PRIVACY_RETENTION_PURGE: 'privacy.retention.purge',
  PATIENT_AT_RISK_EVALUATE: 'patient.at_risk.evaluate',
  PATIENT_NPS_TRIGGER: 'patient.nps.trigger',
  PATIENT_WINBACK: 'patient.winback',
  PATIENT_PRIVACY_ERASURE: 'patient.privacy.erasure',
  ATTENDANCE_MONTHLY_SUMMARY: 'attendance.monthly.summary',
  STAFF_ATTENDANCE_CONSULTATION: 'staff.attendance.consultation',
  INSURANCE_CLAIM_SUBMIT: 'insurance.claim.submit',
  INSURANCE_CLAIM_RETRY: 'insurance.claim.retry',
  INSURANCE_CLAIM_AGEING: 'insurance.claim.ageing',
  INSURANCE_RECONCILIATION: 'insurance.reconciliation',
  PHARMACY_LOW_STOCK_SCAN: 'pharmacy.low_stock.scan',
  PHARMACY_EXPIRY_SCAN: 'pharmacy.expiry.scan',
  PHARMACY_DISPENSING_BILLING: 'pharmacy.dispensing.billing',
  DIAGNOSTIC_AGGREGATOR_SUBMIT: 'diagnostic.aggregator.submit',
  BILLING_DEPARTMENT_PROCESS: 'billing.department.process',
  PHARMACY_PRESCRIPTION_PROCESS: 'pharmacy.prescription.process',
  SCHEDULER_TEST_NOOP: 'scheduler.test.noop',
  REPORT_PROJECTION_REFRESH: 'reports.projection.refresh',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
