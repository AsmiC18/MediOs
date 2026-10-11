export type InsurancePayerSubmitResult =
  | { outcome: 'MANUAL_REQUIRED'; message: string }
  | { outcome: 'SUBMITTED'; externalReference: string };

export interface InsurancePayerAdapter {
  submitClaim(input: {
    hospitalId: string;
    claimId: string;
    claimNumber: string;
  }): Promise<InsurancePayerSubmitResult>;
}

export const INSURANCE_PAYER_ADAPTER = Symbol('INSURANCE_PAYER_ADAPTER');
