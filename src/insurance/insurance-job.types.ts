export type InsuranceClaimSubmitJobPayload = {
  claimId: string;
};

export type InsuranceClaimRetryJobPayload = {
  claimId: string;
};

export type InsuranceClaimAgeingJobPayload = {
  asOfDate?: string;
};

export type InsuranceReconciliationJobPayload = {
  branchId?: string | null;
};
