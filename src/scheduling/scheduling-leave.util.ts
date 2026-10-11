import { ConflictException } from '@nestjs/common';
import { LeaveStatus, Prisma } from '@prisma/client';

/** Standard half-open-friendly overlap: touching intervals do not overlap. */
export function schedulingIntervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function leaveAppliesToAppointmentBranch(
  leaveBranchId: string | null,
  appointmentBranchId: string | null | undefined,
): boolean {
  if (leaveBranchId == null) {
    return true;
  }
  if (appointmentBranchId == null) {
    return false;
  }
  return leaveBranchId === appointmentBranchId;
}

export function buildActiveLeaveOverlapWhere(input: {
  hospitalId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  excludeLeaveId?: string;
}): Prisma.LeaveWhereInput {
  return {
    hospitalId: input.hospitalId,
    userId: input.userId,
    status: LeaveStatus.ACTIVE,
    ...(input.excludeLeaveId && { id: { not: input.excludeLeaveId } }),
    startAt: { lt: input.endAt },
    endAt: { gt: input.startAt },
  };
}

export const PROVIDER_LEAVE_CONFLICT_MESSAGE =
  'Scheduling conflict: one or more providers are on leave during this time.';

export function assertNoLeaveOverlapFound(
  overlapping: { id: string } | null,
): void {
  if (overlapping) {
    throw new ConflictException(PROVIDER_LEAVE_CONFLICT_MESSAGE);
  }
}
