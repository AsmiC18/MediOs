import { InsuranceClaimStatus } from '@prisma/client';

const TERMINAL_CLAIM_STATUSES = new Set<InsuranceClaimStatus>([
  InsuranceClaimStatus.REJECTED,
  InsuranceClaimStatus.PAID,
  InsuranceClaimStatus.CANCELLED,
]);

export function isOpenInsuranceClaimStatus(status: InsuranceClaimStatus): boolean {
  return !TERMINAL_CLAIM_STATUSES.has(status);
}

export const OPEN_CLAIM_STATUSES: InsuranceClaimStatus[] = (
  Object.values(InsuranceClaimStatus) as InsuranceClaimStatus[]
).filter(isOpenInsuranceClaimStatus);
