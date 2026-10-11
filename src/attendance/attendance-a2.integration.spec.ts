import { AppointmentStatus } from '@prisma/client';
import { buildAppointmentMatchWhere } from './appointment-clock-in-match.util';
import {
  buildStaffAttendanceConsultationDomainEvent,
  staffAttendanceConsultationIdempotencyKey,
  STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE,
} from './staff-attendance-consultation-event.util';

describe('A2 appointment matching', () => {
  const hospitalId = 'h1';
  const resourceId = 'doc-res';
  const clockInAt = new Date('2026-03-10T10:30:00.000Z');

  it('matches [startAt, endAt) interval', () => {
    const where = buildAppointmentMatchWhere({
      hospitalId,
      resourceId,
      clockInAt,
      attendanceBranchId: 'b1',
    });

    expect(where.startAt).toEqual({ lte: clockInAt });
    expect(where.endAt).toEqual({ gt: clockInAt });
    expect(where.status).toEqual({
      notIn: [
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
        AppointmentStatus.COMPLETED,
      ],
    });
  });
});

describe('A2 consultation domain event', () => {
  it('builds deterministic idempotency key and payload', () => {
    const appointment = {
      id: 'appt-1',
      patientId: 'pat-1',
      hospitalId: 'h1',
      branchId: 'b1',
      startAt: new Date('2026-03-10T10:00:00.000Z'),
      endAt: new Date('2026-03-10T11:00:00.000Z'),
    };

    const event = buildStaffAttendanceConsultationDomainEvent({
      attendanceId: 'att-1',
      userId: 'user-1',
      resourceId: 'res-1',
      appointment,
      clockInAt: new Date('2026-03-10T10:30:00.000Z'),
    });

    expect(event.eventType).toBe(STAFF_ATTENDANCE_CONSULTATION_EVENT_TYPE);
    expect(event.idempotencyKey).toBe(
      staffAttendanceConsultationIdempotencyKey('appt-1'),
    );
    expect(event.payload).toMatchObject({
      appointmentId: 'appt-1',
      patientId: 'pat-1',
      hospitalId: 'h1',
    });
  });
});
