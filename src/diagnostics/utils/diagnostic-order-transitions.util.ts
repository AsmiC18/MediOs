import { DiagnosticOrderStatus } from '@prisma/client';

export const ALLOWED_DIAGNOSTIC_ORDER_TRANSITIONS: Record<
  DiagnosticOrderStatus,
  DiagnosticOrderStatus[]
> = {
  [DiagnosticOrderStatus.ORDERED]: [
    DiagnosticOrderStatus.SAMPLE_COLLECTED,
    DiagnosticOrderStatus.CANCELLED,
  ],
  [DiagnosticOrderStatus.SAMPLE_COLLECTED]: [
    DiagnosticOrderStatus.PROCESSING,
    DiagnosticOrderStatus.CANCELLED,
  ],
  [DiagnosticOrderStatus.PROCESSING]: [
    DiagnosticOrderStatus.COMPLETED,
    DiagnosticOrderStatus.CANCELLED,
  ],
  [DiagnosticOrderStatus.COMPLETED]: [],
  [DiagnosticOrderStatus.CANCELLED]: [],
};

export function isAllowedDiagnosticOrderTransition(
  currentStatus: DiagnosticOrderStatus,
  nextStatus: DiagnosticOrderStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }

  return (ALLOWED_DIAGNOSTIC_ORDER_TRANSITIONS[currentStatus] ?? []).includes(
    nextStatus,
  );
}

export function isDiagnosticOrderCancellable(
  status: DiagnosticOrderStatus,
): boolean {
  return (
    status === DiagnosticOrderStatus.ORDERED ||
    status === DiagnosticOrderStatus.SAMPLE_COLLECTED ||
    status === DiagnosticOrderStatus.PROCESSING
  );
}

export function canCollectSample(status: DiagnosticOrderStatus): boolean {
  return status === DiagnosticOrderStatus.ORDERED;
}

export function canStartProcessing(status: DiagnosticOrderStatus): boolean {
  return status === DiagnosticOrderStatus.SAMPLE_COLLECTED;
}

export function canEnterResult(status: DiagnosticOrderStatus): boolean {
  return (
    status === DiagnosticOrderStatus.SAMPLE_COLLECTED ||
    status === DiagnosticOrderStatus.PROCESSING
  );
}

export function canCompleteOrder(status: DiagnosticOrderStatus): boolean {
  return status === DiagnosticOrderStatus.PROCESSING;
}
