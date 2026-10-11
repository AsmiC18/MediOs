import {
  APPOINTMENT_BOOKED_CATEGORY,
  APPOINTMENT_CANCELLED_CATEGORY,
  APPOINTMENT_REMINDER_1H_CATEGORY,
  APPOINTMENT_REMINDER_24H_CATEGORY,
  APPOINTMENT_REMINDER_48H_CATEGORY,
  APPOINTMENT_RESCHEDULED_CATEGORY,
  EMERGENCY_VISIT_ESCALATED_CATEGORY,
  PHARMACY_BATCH_EXPIRED_CATEGORY,
  PHARMACY_BATCH_EXPIRING_CATEGORY,
  PHARMACY_LOW_STOCK_CATEGORY,
  DIAGNOSTIC_ORDER_COMPLETED_CATEGORY,
  CLINICAL_PRESCRIPTION_CREATED_CATEGORY,
  PATIENT_NPS_REQUEST_CATEGORY,
  PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY,
  PATIENT_WINBACK_REQUESTED_CATEGORY,
} from './notification-policy.constants';
import { NotificationPolicyMetadata } from './notification-policy.types';

const UNKNOWN_DEFAULT: NotificationPolicyMetadata = {
  kind: 'unknown',
  requiresPatientWhatsAppPreference: false,
  requiresAppointmentValidation: false,
};

const POLICY_BY_CATEGORY: Record<string, NotificationPolicyMetadata> = {
  [APPOINTMENT_BOOKED_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [APPOINTMENT_REMINDER_48H_CATEGORY]: {
    kind: 'reminder',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: true,
  },
  [APPOINTMENT_REMINDER_24H_CATEGORY]: {
    kind: 'reminder',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: true,
  },
  [APPOINTMENT_REMINDER_1H_CATEGORY]: {
    kind: 'reminder',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: true,
  },
  [APPOINTMENT_CANCELLED_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [APPOINTMENT_RESCHEDULED_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [EMERGENCY_VISIT_ESCALATED_CATEGORY]: {
    kind: 'unknown',
    requiresPatientWhatsAppPreference: false,
    requiresAppointmentValidation: false,
  },
  [PHARMACY_LOW_STOCK_CATEGORY]: {
    kind: 'unknown',
    requiresPatientWhatsAppPreference: false,
    requiresAppointmentValidation: false,
  },
  [PHARMACY_BATCH_EXPIRED_CATEGORY]: {
    kind: 'unknown',
    requiresPatientWhatsAppPreference: false,
    requiresAppointmentValidation: false,
  },
  [PHARMACY_BATCH_EXPIRING_CATEGORY]: {
    kind: 'unknown',
    requiresPatientWhatsAppPreference: false,
    requiresAppointmentValidation: false,
  },
  [DIAGNOSTIC_ORDER_COMPLETED_CATEGORY]: {
    kind: 'unknown',
    requiresPatientWhatsAppPreference: false,
    requiresAppointmentValidation: false,
  },
  [CLINICAL_PRESCRIPTION_CREATED_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [PATIENT_NPS_REQUEST_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [PATIENT_ENGAGEMENT_FOLLOW_UP_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
  [PATIENT_WINBACK_REQUESTED_CATEGORY]: {
    kind: 'transactional',
    requiresPatientWhatsAppPreference: true,
    requiresAppointmentValidation: false,
  },
};

/**
 * Code-level policy metadata keyed by Notification.category (outbox eventType).
 * Unknown categories default to ALLOW without preference or appointment checks.
 */
export function getNotificationPolicyMetadata(
  category: string,
): NotificationPolicyMetadata {
  return POLICY_BY_CATEGORY[category] ?? UNKNOWN_DEFAULT;
}
