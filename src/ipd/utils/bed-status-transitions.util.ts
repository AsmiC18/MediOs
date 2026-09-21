import { BedStatus } from '@prisma/client';

export const ALLOWED_BED_STATUS_TRANSITIONS: Record<BedStatus, BedStatus[]> = {
  [BedStatus.AVAILABLE]: [BedStatus.MAINTENANCE, BedStatus.INACTIVE],
  [BedStatus.OCCUPIED]: [],
  [BedStatus.MAINTENANCE]: [BedStatus.AVAILABLE, BedStatus.INACTIVE],
  [BedStatus.INACTIVE]: [],
};

export function isAllowedBedStatusTransition(
  currentStatus: BedStatus,
  nextStatus: BedStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return true;
  }

  return (ALLOWED_BED_STATUS_TRANSITIONS[currentStatus] ?? []).includes(nextStatus);
}
