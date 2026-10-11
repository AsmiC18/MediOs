import { Prisma } from '@prisma/client';
import { DomainEventEnvelope } from '../notifications/domain-event.types';

export const STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE =
  'staff.attendance.consultation';

export const STAFF_ATTENDANCE_CONSULTATION_ENTITY_TYPE = 'Appointment';

export type StaffAttendanceConsultationEventPayload = {
  attendanceId: string;
  userId: string;
  resourceId: string;
  appointmentId: string;
  patientId: string;
  hospitalId: string;
  branchId: string | null;
  clockInAt: string;
  appointmentStartAt: string;
  appointmentEndAt: string;
};

export function staffAttendanceConsultationIdempotencyKey(
  appointmentId: string,
): string {
  return `${STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE}:${appointmentId}`;
}

export function buildStaffAttendanceConsultationDomainEvent(input: {
  attendanceId: string;
  userId: string;
  resourceId: string;
  appointment: {
    id: string;
    patientId: string;
    hospitalId: string;
    branchId: string | null;
    startAt: Date;
    endAt: Date;
  };
  clockInAt: Date;
}): DomainEventEnvelope {
  const payload: StaffAttendanceConsultationEventPayload = {
    attendanceId: input.attendanceId,
    userId: input.userId,
    resourceId: input.resourceId,
    appointmentId: input.appointment.id,
    patientId: input.appointment.patientId,
    hospitalId: input.appointment.hospitalId,
    branchId: input.appointment.branchId,
    clockInAt: input.clockInAt.toISOString(),
    appointmentStartAt: input.appointment.startAt.toISOString(),
    appointmentEndAt: input.appointment.endAt.toISOString(),
  };

  return {
    hospitalId: input.appointment.hospitalId,
    branchId: input.appointment.branchId,
    eventType: STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE,
    entityType: STAFF_ATTENDANCE_CONSULTATION_ENTITY_TYPE,
    entityId: input.appointment.id,
    idempotencyKey: staffAttendanceConsultationIdempotencyKey(
      input.appointment.id,
    ),
    payload: payload as unknown as Prisma.InputJsonValue,
  };
}
