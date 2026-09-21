import { InsuranceClaimStatus } from '@prisma/client';

export const ALLOWED_CLAIM_TRANSITIONS: Record<
  InsuranceClaimStatus,
  InsuranceClaimStatus[]
> = {
  [InsuranceClaimStatus.DRAFT]: [
    InsuranceClaimStatus.READY,
    InsuranceClaimStatus.SUBMITTED,
    InsuranceClaimStatus.CANCELLED,
  ],
  [InsuranceClaimStatus.READY]: [
    InsuranceClaimStatus.SUBMITTED,
    InsuranceClaimStatus.CANCELLED,
  ],
  [InsuranceClaimStatus.SUBMITTED]: [
    InsuranceClaimStatus.UNDER_REVIEW,
    InsuranceClaimStatus.CANCELLED,
  ],
  [InsuranceClaimStatus.UNDER_REVIEW]: [
    InsuranceClaimStatus.APPROVED,
    InsuranceClaimStatus.PARTIALLY_APPROVED,
    InsuranceClaimStatus.REJECTED,
    InsuranceClaimStatus.CANCELLED,
  ],
  [InsuranceClaimStatus.APPROVED]: [InsuranceClaimStatus.PAID],
  [InsuranceClaimStatus.PARTIALLY_APPROVED]: [InsuranceClaimStatus.PAID],
  [InsuranceClaimStatus.REJECTED]: [],
  [InsuranceClaimStatus.PAID]: [],
  [InsuranceClaimStatus.CANCELLED]: [],
};

export function isAllowedClaimTransition(
  current: InsuranceClaimStatus,
  next: InsuranceClaimStatus,
): boolean {
  if (current === next) return false;
  return (ALLOWED_CLAIM_TRANSITIONS[current] ?? []).includes(next);
}

export function isClaimCancellable(status: InsuranceClaimStatus): boolean {
  return (
    status === InsuranceClaimStatus.DRAFT ||
    status === InsuranceClaimStatus.READY ||
    status === InsuranceClaimStatus.SUBMITTED ||
    status === InsuranceClaimStatus.UNDER_REVIEW
  );
}
