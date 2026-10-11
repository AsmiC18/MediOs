import { NotificationPolicySkipReasonCode } from './notification-policy.constants';

export type NotificationPolicyKind = 'transactional' | 'reminder' | 'unknown';

export type NotificationPolicyMetadata = {
  kind: NotificationPolicyKind;
  requiresPatientWhatsAppPreference: boolean;
  requiresAppointmentValidation: boolean;
};

export type NotificationPolicyAllowDecision = {
  action: 'ALLOW';
};

export type NotificationPolicySkipDecision = {
  action: 'SKIP';
  reasonCode: NotificationPolicySkipReasonCode;
};

export type NotificationPolicyDecision =
  | NotificationPolicyAllowDecision
  | NotificationPolicySkipDecision;

export type NotificationPolicyEvaluationContext = {
  jobId?: string;
  workerId?: string;
};
