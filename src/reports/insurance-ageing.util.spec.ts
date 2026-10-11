import { InsuranceClaimStatus, Prisma } from '@prisma/client';
import {
  bucketKeyForAge,
  buildInsuranceAgeingSummary,
  claimAgeInDays,
  isClaimOutstandingAsOf,
} from './insurance-ageing.util';

describe('insurance-ageing.util', () => {
  it('maps ages to every bucket boundary', () => {
    expect(bucketKeyForAge(0)).toBe('0_7');
    expect(bucketKeyForAge(7)).toBe('0_7');
    expect(bucketKeyForAge(8)).toBe('8_15');
    expect(bucketKeyForAge(15)).toBe('8_15');
    expect(bucketKeyForAge(16)).toBe('16_30');
    expect(bucketKeyForAge(30)).toBe('16_30');
    expect(bucketKeyForAge(31)).toBe('31_60');
    expect(bucketKeyForAge(60)).toBe('31_60');
    expect(bucketKeyForAge(61)).toBe('61_90');
    expect(bucketKeyForAge(90)).toBe('61_90');
    expect(bucketKeyForAge(91)).toBe('90_plus');
  });

  it('aggregates totals and outstanding', () => {
    const asOf = new Date('2026-10-06T12:00:00Z');
    const submittedAt = new Date('2026-09-20T12:00:00Z');
    const age = claimAgeInDays(
      {
        id: 'c1',
        status: InsuranceClaimStatus.SUBMITTED,
        claimedAmount: new Prisma.Decimal('1000'),
        approvedAmount: new Prisma.Decimal('800'),
        paidAmount: new Prisma.Decimal('200'),
        submittedAt,
        createdAt: submittedAt,
      },
      asOf,
    );
    expect(age).toBe(16);

    const summary = buildInsuranceAgeingSummary(
      [
        {
          id: 'c1',
          status: InsuranceClaimStatus.SUBMITTED,
          claimedAmount: new Prisma.Decimal('1000'),
          approvedAmount: new Prisma.Decimal('800'),
          paidAmount: new Prisma.Decimal('200'),
          submittedAt,
          createdAt: submittedAt,
        },
      ],
      asOf,
    );

    expect(summary.totals.claimCount).toBe(1);
    expect(summary.totals.outstandingAmount).toBe('600.00');
    expect(summary.buckets.some((b) => b.label === '16-30' && b.claimCount === 1)).toBe(
      true,
    );
  });

  it('includes claims submitted before from when still open at asOf', () => {
    const asOf = new Date('2026-10-06T00:00:00.000Z');
    const submittedAt = new Date('2025-01-01T00:00:00.000Z');
    expect(
      isClaimOutstandingAsOf(
        {
          id: 'c-old',
          status: InsuranceClaimStatus.SUBMITTED,
          claimedAmount: new Prisma.Decimal('100'),
          approvedAmount: null,
          paidAmount: new Prisma.Decimal('0'),
          submittedAt,
          createdAt: submittedAt,
        },
        asOf,
      ),
    ).toBe(true);
  });

  it('excludes claims paid before asOf', () => {
    const asOf = new Date('2026-10-06T00:00:00.000Z');
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(
      isClaimOutstandingAsOf(
        {
          id: 'c-paid',
          status: InsuranceClaimStatus.PAID,
          claimedAmount: new Prisma.Decimal('100'),
          approvedAmount: new Prisma.Decimal('100'),
          paidAmount: new Prisma.Decimal('100'),
          submittedAt,
          createdAt: submittedAt,
          paidAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        asOf,
      ),
    ).toBe(false);
  });
});
