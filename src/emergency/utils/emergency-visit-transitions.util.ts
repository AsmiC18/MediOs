import { EmergencyVisitStatus } from '@prisma/client';

export const ALLOWED_EMERGENCY_VISIT_TRANSITIONS: Record<
  EmergencyVisitStatus,
  EmergencyVisitStatus[]
> = {
  [EmergencyVisitStatus.ARRIVED]: [
    EmergencyVisitStatus.TRIAGED,
    EmergencyVisitStatus.CANCELLED,
  ],
  [EmergencyVisitStatus.TRIAGED]: [
    EmergencyVisitStatus.IN_TREATMENT,
    EmergencyVisitStatus.CANCELLED,
  ],
  [EmergencyVisitStatus.IN_TREATMENT]: [
    EmergencyVisitStatus.DISCHARGED,
    EmergencyVisitStatus.ADMITTED,
    EmergencyVisitStatus.TRANSFERRED,
    EmergencyVisitStatus.LEFT_WITHOUT_BEING_SEEN,
  ],
  [EmergencyVisitStatus.DISCHARGED]: [],
  [EmergencyVisitStatus.ADMITTED]: [],
  [EmergencyVisitStatus.TRANSFERRED]: [],
  [EmergencyVisitStatus.LEFT_WITHOUT_BEING_SEEN]: [],
  [EmergencyVisitStatus.CANCELLED]: [],
};

export function isAllowedEmergencyVisitTransition(
  currentStatus: EmergencyVisitStatus,
  nextStatus: EmergencyVisitStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  return (ALLOWED_EMERGENCY_VISIT_TRANSITIONS[currentStatus] ?? []).includes(
    nextStatus,
  );
}

export function isEmergencyVisitCancellable(
  status: EmergencyVisitStatus,
): boolean {
  return (
    status === EmergencyVisitStatus.ARRIVED ||
    status === EmergencyVisitStatus.TRIAGED
  );
}

export function isEmergencyVisitTerminal(status: EmergencyVisitStatus): boolean {
  return (
    status === EmergencyVisitStatus.DISCHARGED ||
    status === EmergencyVisitStatus.ADMITTED ||
    status === EmergencyVisitStatus.TRANSFERRED ||
    status === EmergencyVisitStatus.LEFT_WITHOUT_BEING_SEEN ||
    status === EmergencyVisitStatus.CANCELLED
  );
}

export function canStartTreatment(status: EmergencyVisitStatus): boolean {
  return status === EmergencyVisitStatus.TRIAGED;
}

export function canSetDisposition(status: EmergencyVisitStatus): boolean {
  return status === EmergencyVisitStatus.IN_TREATMENT;
}
