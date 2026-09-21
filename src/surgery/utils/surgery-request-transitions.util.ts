import { SurgeryRequestStatus } from '@prisma/client';

export const ALLOWED_SURGERY_REQUEST_TRANSITIONS: Record<
  SurgeryRequestStatus,
  SurgeryRequestStatus[]
> = {
  [SurgeryRequestStatus.REQUESTED]: [
    SurgeryRequestStatus.PRE_OP,
    SurgeryRequestStatus.CANCELLED,
  ],
  [SurgeryRequestStatus.PRE_OP]: [
    SurgeryRequestStatus.SCHEDULED,
    SurgeryRequestStatus.CANCELLED,
  ],
  [SurgeryRequestStatus.SCHEDULED]: [
    SurgeryRequestStatus.IN_PROGRESS,
    SurgeryRequestStatus.CANCELLED,
  ],
  [SurgeryRequestStatus.IN_PROGRESS]: [
    SurgeryRequestStatus.COMPLETED,
    SurgeryRequestStatus.CANCELLED,
  ],
  [SurgeryRequestStatus.COMPLETED]: [],
  [SurgeryRequestStatus.CANCELLED]: [],
};

export function isAllowedSurgeryRequestTransition(
  current: SurgeryRequestStatus,
  next: SurgeryRequestStatus,
): boolean {
  if (current === next) return false;
  return (ALLOWED_SURGERY_REQUEST_TRANSITIONS[current] ?? []).includes(next);
}

export function isSurgeryRequestCancellable(status: SurgeryRequestStatus): boolean {
  return (
    status === SurgeryRequestStatus.REQUESTED ||
    status === SurgeryRequestStatus.PRE_OP ||
    status === SurgeryRequestStatus.SCHEDULED ||
    status === SurgeryRequestStatus.IN_PROGRESS
  );
}
