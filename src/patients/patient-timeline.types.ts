export const PATIENT_TIMELINE_EVENT = {
  APPOINTMENT_SCHEDULED: 'patient.appointment.scheduled',
  PRESCRIPTION_CREATED: 'patient.prescription.created',
  INVOICE_ISSUED: 'patient.invoice.issued',
  DIAGNOSTIC_ORDERED: 'patient.diagnostic.ordered',
  INSURANCE_CLAIM_SUBMITTED: 'patient.insurance_claim.submitted',
} as const;

export type PatientTimelineEventType =
  (typeof PATIENT_TIMELINE_EVENT)[keyof typeof PATIENT_TIMELINE_EVENT];

export type PatientTimelineItemResponse = {
  eventType: PatientTimelineEventType;
  occurredAt: string;
  entityId: string;
  branchId: string | null;
  summary: Record<string, string | number | null>;
};

export type PatientTimelineResponse = {
  patientId: string;
  data: PatientTimelineItemResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
