import { InsuranceClaimStatus, InsurancePreAuthorizationStatus } from '@prisma/client';
import { isAllowedClaimTransition } from './claim-transitions.util';
import { isAllowedPreauthTransition } from './preauth-transitions.util';

describe('insurance transition matrices', () => {
  describe('preauth', () => {
    const valid: Array<[InsurancePreAuthorizationStatus, InsurancePreAuthorizationStatus]> = [
      [InsurancePreAuthorizationStatus.DRAFT, InsurancePreAuthorizationStatus.SUBMITTED],
      [InsurancePreAuthorizationStatus.SUBMITTED, InsurancePreAuthorizationStatus.UNDER_REVIEW],
      [InsurancePreAuthorizationStatus.UNDER_REVIEW, InsurancePreAuthorizationStatus.APPROVED],
      [
        InsurancePreAuthorizationStatus.UNDER_REVIEW,
        InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
      ],
      [InsurancePreAuthorizationStatus.UNDER_REVIEW, InsurancePreAuthorizationStatus.REJECTED],
      [InsurancePreAuthorizationStatus.DRAFT, InsurancePreAuthorizationStatus.CANCELLED],
    ];

    it.each(valid)('allows %s → %s', (from, to) => {
      expect(isAllowedPreauthTransition(from, to)).toBe(true);
    });

    it('blocks terminal reopen', () => {
      expect(
        isAllowedPreauthTransition(
          InsurancePreAuthorizationStatus.REJECTED,
          InsurancePreAuthorizationStatus.SUBMITTED,
        ),
      ).toBe(false);
    });
  });

  describe('claims', () => {
    const valid: Array<[InsuranceClaimStatus, InsuranceClaimStatus]> = [
      [InsuranceClaimStatus.READY, InsuranceClaimStatus.SUBMITTED],
      [InsuranceClaimStatus.SUBMITTED, InsuranceClaimStatus.UNDER_REVIEW],
      [InsuranceClaimStatus.UNDER_REVIEW, InsuranceClaimStatus.APPROVED],
      [InsuranceClaimStatus.UNDER_REVIEW, InsuranceClaimStatus.PARTIALLY_APPROVED],
      [InsuranceClaimStatus.UNDER_REVIEW, InsuranceClaimStatus.REJECTED],
      [InsuranceClaimStatus.APPROVED, InsuranceClaimStatus.PAID],
      [InsuranceClaimStatus.READY, InsuranceClaimStatus.CANCELLED],
    ];

    it.each(valid)('allows %s → %s', (from, to) => {
      expect(isAllowedClaimTransition(from, to)).toBe(true);
    });

    it('blocks PAID → SUBMITTED', () => {
      expect(
        isAllowedClaimTransition(InsuranceClaimStatus.PAID, InsuranceClaimStatus.SUBMITTED),
      ).toBe(false);
    });
  });
});
