/** Machine-readable skip reasons stored on Notification.lastError (H6-A). */
export const NOTIFICATION_POLICY_SKIP_REASON = {
  PATIENT_WHATSAPP_OPTED_OUT: 'PATIENT_WHATSAPP_OPTED_OUT',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  APPOINTMENT_HOSPITAL_MISMATCH: 'APPOINTMENT_HOSPITAL_MISMATCH',
  APPOINTMENT_PATIENT_MISMATCH: 'APPOINTMENT_PATIENT_MISMATCH',
  APPOINTMENT_NOT_SCHEDULED: 'APPOINTMENT_NOT_SCHEDULED',
  APPOINTMENT_TIME_CHANGED: 'APPOINTMENT_TIME_CHANGED',
  NO_PATIENT: 'NO_PATIENT',
  UNKNOWN_NOTIFICATION_POLICY: 'UNKNOWN_NOTIFICATION_POLICY',
} as const;

export type NotificationPolicySkipReasonCode =
  (typeof NOTIFICATION_POLICY_SKIP_REASON)[keyof typeof NOTIFICATION_POLICY_SKIP_REASON];

export const APPOINTMENT_BOOKED_CATEGORY = 'appointment.booked';

export const APPOINTMENT_REMINDER_48H_CATEGORY = 'appointment.reminder.48h';

export const APPOINTMENT_REMINDER_24H_CATEGORY = 'appointment.reminder.24h';

export const APPOINTMENT_REMINDER_1H_CATEGORY = 'appointment.reminder.1h';

export const APPOINTMENT_CANCELLED_CATEGORY = 'appointment.cancelled';

export const APPOINTMENT_RESCHEDULED_CATEGORY = 'appointment.rescheduled';

/** Internal operational escalation (unrouted channel; not patient WhatsApp). */
export const EMERGENCY_VISIT_ESCALATED_CATEGORY = 'emergency.visit.escalated';

export const PHARMACY_LOW_STOCK_CATEGORY = 'pharmacy.inventory.low_stock';
export const PHARMACY_BATCH_EXPIRED_CATEGORY = 'pharmacy.inventory.batch_expired';
export const PHARMACY_BATCH_EXPIRING_CATEGORY = 'pharmacy.inventory.batch_expiring';

export const DIAGNOSTIC_ORDER_COMPLETED_CATEGORY = 'diagnostic.order.completed';

export const CLINICAL_PRESCRIPTION_CREATED_CATEGORY =
  'clinical.prescription.created';

export const PATIENT_NPS_REQUEST_CATEGORY = 'patient.nps.request';

export const PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY =
  'patient.engagement.follow_up_reminder';

export const PATIENT_WINBACK_REQUESTED_CATEGORY = 'patient.winback.requested';
