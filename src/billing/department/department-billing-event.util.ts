import { Prisma } from '@prisma/client';
import { staffAttendanceConsultationIdempotencyKey } from '../../attendance/staff-attendance-consultation-event.util';
import { DomainEventEnvelope } from '../../notifications/domain-event.types';

export const OPD_CONSULTATION_BILLING_EVENT_TYPE = 'opd.consultation.billing';
export const IPD_DISCHARGE_BILLING_EVENT_TYPE = 'ipd.discharge.billing';
export const EMERGENCY_VISIT_BILLING_EVENT_TYPE = 'emergency.visit.billing';
export const DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE = 'diagnostic.order.billing';
export const SURGERY_PROCEDURE_BILLING_EVENT_TYPE = 'surgery.procedure.billing';

export function opdConsultationBillingSourceKey(appointmentId: string): string {
  return staffAttendanceConsultationIdempotencyKey(appointmentId);
}

export function ipdDischargeBillingSourceKey(admissionId: string): string {
  return `ipd.discharge:${admissionId}`;
}

export function emergencyVisitBillingSourceKey(visitId: string): string {
  return `emergency.visit:${visitId}`;
}

export function diagnosticOrderItemBillingSourceKey(itemId: string): string {
  return `diagnostic.order.item:${itemId}`;
}

export function surgeryProcedureBillingSourceKey(surgeryRequestId: string): string {
  return `surgery.procedure:${surgeryRequestId}`;
}

export function buildOpdConsultationBillingEvent(input: {
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  queueEntryId: string;
}): DomainEventEnvelope {
  const payload = {
    appointmentId: input.appointmentId,
    patientId: input.patientId,
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    queueEntryId: input.queueEntryId,
  };
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: OPD_CONSULTATION_BILLING_EVENT_TYPE,
    entityType: 'Appointment',
    entityId: input.appointmentId,
    idempotencyKey: `${OPD_CONSULTATION_BILLING_EVENT_TYPE}:${input.appointmentId}`,
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function buildIpdDischargeBillingEvent(input: {
  admissionId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const payload = { ...input };
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: IPD_DISCHARGE_BILLING_EVENT_TYPE,
    entityType: 'IpdAdmission',
    entityId: input.admissionId,
    idempotencyKey: `${IPD_DISCHARGE_BILLING_EVENT_TYPE}:${input.admissionId}`,
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function buildEmergencyVisitBillingEvent(input: {
  visitId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const payload = { ...input };
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: EMERGENCY_VISIT_BILLING_EVENT_TYPE,
    entityType: 'EmergencyVisit',
    entityId: input.visitId,
    idempotencyKey: `${EMERGENCY_VISIT_BILLING_EVENT_TYPE}:${input.visitId}`,
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function buildDiagnosticOrderBillingEvent(input: {
  diagnosticOrderId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const payload = { ...input };
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE,
    entityType: 'DiagnosticOrder',
    entityId: input.diagnosticOrderId,
    idempotencyKey: `${DIAGNOSTIC_ORDER_BILLING_EVENT_TYPE}:${input.diagnosticOrderId}`,
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}

export function buildSurgeryProcedureBillingEvent(input: {
  surgeryRequestId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
}): DomainEventEnvelope {
  const payload = { ...input };
  return {
    hospitalId: input.hospitalId,
    branchId: input.branchId,
    eventType: SURGERY_PROCEDURE_BILLING_EVENT_TYPE,
    entityType: 'SurgeryRequest',
    entityId: input.surgeryRequestId,
    idempotencyKey: `${SURGERY_PROCEDURE_BILLING_EVENT_TYPE}:${input.surgeryRequestId}`,
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
