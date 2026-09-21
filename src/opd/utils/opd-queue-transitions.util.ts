import { OpdQueueStatus } from '@prisma/client';

export const ALLOWED_OPD_QUEUE_TRANSITIONS: Record<
  OpdQueueStatus,
  OpdQueueStatus[]
> = {
  [OpdQueueStatus.WAITING]: [
    OpdQueueStatus.CALLED,
    OpdQueueStatus.NO_SHOW,
    OpdQueueStatus.CANCELLED,
  ],
  [OpdQueueStatus.CALLED]: [
    OpdQueueStatus.IN_CONSULTATION,
    OpdQueueStatus.NO_SHOW,
    OpdQueueStatus.CANCELLED,
  ],
  [OpdQueueStatus.IN_CONSULTATION]: [
    OpdQueueStatus.COMPLETED,
    OpdQueueStatus.NO_SHOW,
  ],
  [OpdQueueStatus.COMPLETED]: [],
  [OpdQueueStatus.NO_SHOW]: [],
  [OpdQueueStatus.CANCELLED]: [],
};

export function isAllowedOpdQueueTransition(
  currentStatus: OpdQueueStatus,
  nextStatus: OpdQueueStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  return (ALLOWED_OPD_QUEUE_TRANSITIONS[currentStatus] ?? []).includes(nextStatus);
}
