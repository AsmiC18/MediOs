import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';

export const ALLOWED_APPOINTMENT_STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  [AppointmentStatus.SCHEDULED]: [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.NO_SHOW,
  ],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
  [AppointmentStatus.NO_SHOW]: [],
};

export function isAllowedAppointmentStatusTransition(
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  return (ALLOWED_APPOINTMENT_STATUS_TRANSITIONS[currentStatus] ?? []).includes(
    nextStatus,
  );
}

export function assertAllowedAppointmentStatusTransition(
  currentStatus: AppointmentStatus,
  nextStatus: AppointmentStatus,
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (nextStatus === AppointmentStatus.CANCELLED) {
    throw new BadRequestException(
      'Use the appointment cancel endpoint to cancel an appointment.',
    );
  }

  if (!isAllowedAppointmentStatusTransition(currentStatus, nextStatus)) {
    throw new BadRequestException(
      `Invalid appointment status transition from ${currentStatus} to ${nextStatus}.`,
    );
  }
}

export function assertAppointmentSchedulingMutable(
  status: AppointmentStatus,
): void {
  if (status !== AppointmentStatus.SCHEDULED) {
    throw new BadRequestException(
      'Cannot modify scheduling fields for a terminal appointment.',
    );
  }
}
