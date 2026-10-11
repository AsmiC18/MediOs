import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { INSURANCE_PAYER_ADAPTER } from './adapters/insurance-payer.adapter';
import { ManualInsurancePayerAdapter } from './adapters/manual-insurance-payer.adapter';
import { InsuranceClaimAgeingJobHandler } from './insurance-claim-ageing.job-handler';
import { InsuranceClaimExternalService } from './insurance-claim-external.service';
import { InsuranceClaimRetryJobHandler } from './insurance-claim-retry.job-handler';
import { InsuranceClaimSubmitJobHandler } from './insurance-claim-submit.job-handler';
import { InsuranceReconciliationJobHandler } from './insurance-reconciliation.job-handler';
import { InsuranceReconciliationService } from './insurance-reconciliation.service';

@Module({
  imports: [CommonModule, AuditModule, JobModule],
  providers: [
    ManualInsurancePayerAdapter,
    {
      provide: INSURANCE_PAYER_ADAPTER,
      useExisting: ManualInsurancePayerAdapter,
    },
    InsuranceClaimExternalService,
    InsuranceReconciliationService,
    InsuranceClaimSubmitJobHandler,
    InsuranceClaimRetryJobHandler,
    InsuranceClaimAgeingJobHandler,
    InsuranceReconciliationJobHandler,
  ],
  exports: [
    InsuranceClaimExternalService,
    InsuranceClaimSubmitJobHandler,
    InsuranceClaimRetryJobHandler,
    InsuranceClaimAgeingJobHandler,
    InsuranceReconciliationJobHandler,
  ],
})
export class InsuranceJobModule {}
