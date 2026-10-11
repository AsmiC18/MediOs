import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import {
  assertAllowedAppointmentStatusTransition,
  assertAppointmentSchedulingMutable,
  isAllowedAppointmentStatusTransition,
} from './appointment-status-transition.util';

describe('appointment status transitions', () => {
  it('allows SCHEDULED to terminal targets', () => {
    expect(
      isAllowedAppointmentStatusTransition(
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.COMPLETED,
      ),
    ).toBe(true);
    expect(
      isAllowedAppointmentStatusTransition(
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CANCELLED,
      ),
    ).toBe(true);
    expect(
      isAllowedAppointmentStatusTransition(
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.NO_SHOW,
      ),
    ).toBe(true);
  });

  it('rejects transitions from terminal states', () => {
    const terminal = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];
    const targets = [
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];

    for (const from of terminal) {
      for (const to of targets) {
        if (from === to) {
          expect(isAllowedAppointmentStatusTransition(from, to)).toBe(true);
        } else {
          expect(isAllowedAppointmentStatusTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it('rejects PATCH cancellation in favor of cancel endpoint', () => {
    expect(() =>
      assertAllowedAppointmentStatusTransition(
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CANCELLED,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows no-op status updates', () => {
    expect(() =>
      assertAllowedAppointmentStatusTransition(
        AppointmentStatus.COMPLETED,
        AppointmentStatus.COMPLETED,
      ),
    ).not.toThrow();
  });

  it('blocks scheduling mutations on terminal appointments', () => {
    expect(() =>
      assertAppointmentSchedulingMutable(AppointmentStatus.COMPLETED),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAppointmentSchedulingMutable(AppointmentStatus.SCHEDULED),
    ).not.toThrow();
  });
});
