import { InsuranceClaimStatus, Prisma } from '@prisma/client';
import { roundMoney } from '../billing/utils/money.util';

/** Reporting buckets — not contractual SLA thresholds. */
export const INSURANCE_AGEING_BUCKETS = [
  { key: '0_7', label: '0-7', minDays: 0, maxDays: 7 },
  { key: '8_15', label: '8-15', minDays: 8, maxDays: 15 },
  { key: '16_30', label: '16-30', minDays: 16, maxDays: 30 },
  { key: '31_60', label: '31-60', minDays: 31, maxDays: 60 },
  { key: '61_90', label: '61-90', minDays: 61, maxDays: 90 },
  { key: '90_plus', label: '90+', minDays: 91, maxDays: null as number | null },
] as const;

export type InsuranceAgeingClaimRow = {
  id: string;
  status: InsuranceClaimStatus;
  claimedAmount: Prisma.Decimal;
  approvedAmount: Prisma.Decimal | null;
  paidAmount: Prisma.Decimal;
  submittedAt: Date | null;
  createdAt: Date;
  paidAt?: Date | null;
  rejectedAt?: Date | null;
};

/**
 * Whether a claim should appear in an as-of ageing report at `asOf`.
 * Uses current status plus paidAt/rejectedAt; historical status transitions are not stored.
 */
export function isClaimOutstandingAsOf(
  claim: InsuranceAgeingClaimRow,
  asOf: Date,
): boolean {
  if (
    claim.status === InsuranceClaimStatus.DRAFT ||
    claim.status === InsuranceClaimStatus.CANCELLED ||
    claim.status === InsuranceClaimStatus.READY
  ) {
    return false;
  }

  const firstActivity = claim.submittedAt ?? claim.createdAt;
  if (firstActivity.getTime() >= asOf.getTime()) {
    return false;
  }

  if (claim.status === InsuranceClaimStatus.PAID && claim.paidAt) {
    if (claim.paidAt.getTime() < asOf.getTime()) {
      return false;
    }
  }

  if (claim.status === InsuranceClaimStatus.REJECTED && claim.rejectedAt) {
    if (claim.rejectedAt.getTime() < asOf.getTime()) {
      return false;
    }
  }

  return true;
}

export function claimAgeInDays(claim: InsuranceAgeingClaimRow, asOf: Date): number {
  const reference = claim.submittedAt ?? claim.createdAt;
  const ms = asOf.getTime() - reference.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function bucketKeyForAge(ageDays: number): string {
  for (const bucket of INSURANCE_AGEING_BUCKETS) {
    if (bucket.maxDays == null) {
      if (ageDays >= bucket.minDays) {
        return bucket.key;
      }
      continue;
    }
    if (ageDays >= bucket.minDays && ageDays <= bucket.maxDays) {
      return bucket.key;
    }
  }
  return '90_plus';
}

export function buildInsuranceAgeingSummary(
  claims: InsuranceAgeingClaimRow[],
  asOf: Date,
) {
  const buckets: Record<
    string,
    {
      label: string;
      claimCount: number;
      claimedAmount: Prisma.Decimal;
      approvedAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      outstandingAmount: Prisma.Decimal;
    }
  > = {};

  for (const b of INSURANCE_AGEING_BUCKETS) {
    buckets[b.key] = {
      label: b.label,
      claimCount: 0,
      claimedAmount: new Prisma.Decimal(0),
      approvedAmount: new Prisma.Decimal(0),
      paidAmount: new Prisma.Decimal(0),
      outstandingAmount: new Prisma.Decimal(0),
    };
  }

  let totalClaimCount = 0;
  let totalClaimed = new Prisma.Decimal(0);
  let totalApproved = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let totalOutstanding = new Prisma.Decimal(0);

  for (const claim of claims) {
    const age = claimAgeInDays(claim, asOf);
    const key = bucketKeyForAge(age);
    const bucket = buckets[key];

    const claimed = roundMoney(claim.claimedAmount);
    const approved = roundMoney(claim.approvedAmount ?? new Prisma.Decimal(0));
    const paid = roundMoney(claim.paidAmount);
    const outstanding = roundMoney(approved.minus(paid));

    bucket.claimCount += 1;
    bucket.claimedAmount = roundMoney(bucket.claimedAmount.plus(claimed));
    bucket.approvedAmount = roundMoney(bucket.approvedAmount.plus(approved));
    bucket.paidAmount = roundMoney(bucket.paidAmount.plus(paid));
    bucket.outstandingAmount = roundMoney(bucket.outstandingAmount.plus(outstanding));

    totalClaimCount += 1;
    totalClaimed = roundMoney(totalClaimed.plus(claimed));
    totalApproved = roundMoney(totalApproved.plus(approved));
    totalPaid = roundMoney(totalPaid.plus(paid));
    totalOutstanding = roundMoney(totalOutstanding.plus(outstanding));
  }

  return {
    totals: {
      claimCount: totalClaimCount,
      claimedAmount: totalClaimed.toFixed(2),
      approvedAmount: totalApproved.toFixed(2),
      paidAmount: totalPaid.toFixed(2),
      outstandingAmount: totalOutstanding.toFixed(2),
    },
    buckets: Object.values(buckets).map((b) => ({
      label: b.label,
      claimCount: b.claimCount,
      claimedAmount: b.claimedAmount.toFixed(2),
      approvedAmount: b.approvedAmount.toFixed(2),
      paidAmount: b.paidAmount.toFixed(2),
      outstandingAmount: b.outstandingAmount.toFixed(2),
    })),
    bucketNote:
      'Ageing buckets are reporting groupings only, not contractual SLA thresholds.',
  };
}
