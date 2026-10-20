export type JobSchedulerConfig = {
  enabled: boolean;
  intervalMs: number;
  /**
   * Wall-clock limit for leader orchestration (session lock held on a dedicated connection).
   * Does not use a long-lived Prisma interactive transaction.
   */
  tickTransactionTimeoutMs: number;
  /** Per-task interactive transaction timeout (each scheduler task runs in its own transaction). */
  taskTransactionTimeoutMs: number;
  /**
   * Max hospitals processed in parallel within one multi-hospital scheduler task.
   * Each hospital still uses its own interactive transaction.
   */
  hospitalConcurrency: number;
  consentExpireEnabled: boolean;
  billingPaymentReconcileEnabled: boolean;
  billingRefundReconcileEnabled: boolean;
  /** Master switch (JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED). */
  appointmentReminderSchedulerEnabled: boolean;
  appointmentReminder48hEnabled: boolean;
  appointmentReminder24hOffsetEnabled: boolean;
  appointmentReminder1hEnabled: boolean;
  /** Non-production test task; never a hospital workflow. */
  testNoopEnabled: boolean;
  testHospitalId: string | null;
  privacyRetentionSchedulerEnabled: boolean;
  patientAtRiskSchedulerEnabled: boolean;
  attendanceMonthlySummarySchedulerEnabled: boolean;
  pharmacyLowStockSchedulerEnabled: boolean;
  pharmacyExpirySchedulerEnabled: boolean;
  pharmacyExpiryWarningDays: number;
};

function readBoolean(envValue: string | undefined, fallback: boolean): boolean {
  if (envValue === undefined || envValue.trim() === '') {
    return fallback;
  }
  const normalized = envValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function readPositiveInt(
  envValue: string | undefined,
  fallback: number,
): number {
  if (envValue === undefined || envValue.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(envValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function loadJobSchedulerConfig(): JobSchedulerConfig {
  return {
    enabled: readBoolean(process.env.JOB_SCHEDULER_ENABLED, true),
    intervalMs: readPositiveInt(process.env.JOB_SCHEDULER_INTERVAL_MS, 60_000),
    tickTransactionTimeoutMs: readPositiveInt(
      process.env.JOB_SCHEDULER_TICK_TRANSACTION_TIMEOUT_MS,
      120_000,
    ),
    taskTransactionTimeoutMs: readPositiveInt(
      process.env.JOB_SCHEDULER_TASK_TRANSACTION_TIMEOUT_MS,
      5_000,
    ),
    hospitalConcurrency: Math.min(
      readPositiveInt(process.env.JOB_SCHEDULER_HOSPITAL_CONCURRENCY, 4),
      16,
    ),
    consentExpireEnabled: readBoolean(
      process.env.JOB_CONSENT_EXPIRE_SCHEDULER_ENABLED,
      true,
    ),
    billingPaymentReconcileEnabled: readBoolean(
      process.env.JOB_BILLING_PAYMENT_RECONCILE_SCHEDULER_ENABLED,
      true,
    ),
    billingRefundReconcileEnabled: readBoolean(
      process.env.JOB_BILLING_REFUND_RECONCILE_SCHEDULER_ENABLED,
      true,
    ),
    appointmentReminderSchedulerEnabled: readBoolean(
      process.env.JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED,
      true,
    ),
    appointmentReminder48hEnabled: readBoolean(
      process.env.JOB_APPOINTMENT_REMINDER_48H_SCHEDULER_ENABLED,
      readBoolean(process.env.JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED, true),
    ),
    appointmentReminder24hOffsetEnabled: readBoolean(
      process.env.JOB_APPOINTMENT_REMINDER_24H_OFFSET_SCHEDULER_ENABLED,
      readBoolean(process.env.JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED, true),
    ),
    appointmentReminder1hEnabled: readBoolean(
      process.env.JOB_APPOINTMENT_REMINDER_1H_SCHEDULER_ENABLED,
      readBoolean(process.env.JOB_APPOINTMENT_REMINDER_24H_SCHEDULER_ENABLED, true),
    ),
    testNoopEnabled: readBoolean(
      process.env.JOB_SCHEDULER_TEST_NOOP_ENABLED,
      false,
    ),
    testHospitalId: process.env.JOB_SCHEDULER_TEST_HOSPITAL_ID?.trim() || null,
    privacyRetentionSchedulerEnabled: readBoolean(
      process.env.JOB_PRIVACY_RETENTION_SCHEDULER_ENABLED,
      false,
    ),
    patientAtRiskSchedulerEnabled: readBoolean(
      process.env.JOB_PATIENT_AT_RISK_SCHEDULER_ENABLED,
      true,
    ),
    attendanceMonthlySummarySchedulerEnabled: readBoolean(
      process.env.JOB_ATTENDANCE_MONTHLY_SUMMARY_SCHEDULER_ENABLED,
      true,
    ),
    pharmacyLowStockSchedulerEnabled: readBoolean(
      process.env.JOB_PHARMACY_LOW_STOCK_SCHEDULER_ENABLED,
      true,
    ),
    pharmacyExpirySchedulerEnabled: readBoolean(
      process.env.JOB_PHARMACY_EXPIRY_SCHEDULER_ENABLED,
      true,
    ),
    pharmacyExpiryWarningDays: readPositiveInt(
      process.env.JOB_PHARMACY_EXPIRY_WARNING_DAYS,
      30,
    ),
  };
}
