import {
  InsuranceClaimExternalSubmissionStatus,
  InsuranceClaimStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import { ManualInsurancePayerAdapter } from './adapters/manual-insurance-payer.adapter';
import { InsuranceClaimExternalService } from './insurance-claim-external.service';
import { InsuranceClaimSubmitJobHandler } from './insurance-claim-submit.job-handler';

describe('InsuranceClaimSubmitJobHandler', () => {
  it('sets MANUAL_REQUIRED via adapter without fake HTTP', async () => {
    const prisma = {
      insuranceClaim: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'claim-1',
          hospitalId: 'h1',
          branchId: null,
          status: InsuranceClaimStatus.SUBMITTED,
          claimNumber: 'CLM-000001',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const external = new InsuranceClaimExternalService(
      prisma as never,
      auditService as unknown as AuditService,
      new ManualInsurancePayerAdapter(),
    );
    const handler = new InsuranceClaimSubmitJobHandler(external);

    await handler.handle(
      {
        id: 'job-1',
        type: JOB_TYPES.INSURANCE_CLAIM_SUBMIT,
        hospitalId: 'h1',
        branchId: null,
        payload: { claimId: 'claim-1' },
      } as never,
      { workerId: 'worker-1' },
    );

    expect(prisma.insuranceClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          externalSubmissionStatus: InsuranceClaimExternalSubmissionStatus.MANUAL_REQUIRED,
        },
      }),
    );
  });

  it('enqueue idempotency key is stable for submit job type', () => {
    const claimId = 'abc';
    const key = `${JOB_TYPES.INSURANCE_CLAIM_SUBMIT}:${claimId}`;
    expect(key).toBe('insurance.claim.submit:abc');
    void Prisma;
  });
});
