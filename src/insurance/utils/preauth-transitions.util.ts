import { InsurancePreAuthorizationStatus } from '@prisma/client';

export const ALLOWED_PREAUTH_TRANSITIONS: Record<
  InsurancePreAuthorizationStatus,
  InsurancePreAuthorizationStatus[]
> = {
  [InsurancePreAuthorizationStatus.DRAFT]: [
    InsurancePreAuthorizationStatus.SUBMITTED,
    InsurancePreAuthorizationStatus.CANCELLED,
  ],
  [InsurancePreAuthorizationStatus.SUBMITTED]: [
    InsurancePreAuthorizationStatus.UNDER_REVIEW,
    InsurancePreAuthorizationStatus.CANCELLED,
  ],
  [InsurancePreAuthorizationStatus.UNDER_REVIEW]: [
    InsurancePreAuthorizationStatus.APPROVED,
    InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
    InsurancePreAuthorizationStatus.REJECTED,
    InsurancePreAuthorizationStatus.CANCELLED,
  ],
  [InsurancePreAuthorizationStatus.APPROVED]: [],
  [InsurancePreAuthorizationStatus.PARTIALLY_APPROVED]: [],
  [InsurancePreAuthorizationStatus.REJECTED]: [],
  [InsurancePreAuthorizationStatus.CANCELLED]: [],
};

export function isAllowedPreauthTransition(
  current: InsurancePreAuthorizationStatus,
  next: InsurancePreAuthorizationStatus,
): boolean {
  if (current === next) return false;
  return (ALLOWED_PREAUTH_TRANSITIONS[current] ?? []).includes(next);
}

export function isPreauthCancellable(
  status: InsurancePreAuthorizationStatus,
): boolean {
  return (
    status === InsurancePreAuthorizationStatus.DRAFT ||
    status === InsurancePreAuthorizationStatus.SUBMITTED ||
    status === InsurancePreAuthorizationStatus.UNDER_REVIEW
  );
}
