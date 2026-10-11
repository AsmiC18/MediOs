import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { CommonModule } from '../common/common.module';
import { JobModule } from '../jobs/job.module';
import { BillingModule } from '../billing/billing.module';
import { InsuranceRateResolverService } from './insurance-rate-resolver.service';
import { InsuranceClaimController } from './insurance-claim.controller';
import { InsuranceEmpanelmentController } from './insurance-empanelment.controller';
import { InsurancePolicyController } from './insurance-policy.controller';
import { InsurancePreauthController } from './insurance-preauth.controller';
import { InsurancePreauthAttachmentController } from './insurance-preauth-attachment.controller';
import { InsurancePreauthAttachmentService } from './insurance-preauth-attachment.service';
import { InsuranceProviderController } from './insurance-provider.controller';
import { INSURANCE_PAYER_ADAPTER } from './adapters/insurance-payer.adapter';
import { ManualInsurancePayerAdapter } from './adapters/manual-insurance-payer.adapter';
import { InsuranceClaimExternalService } from './insurance-claim-external.service';
import { InsuranceService } from './insurance.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    JobModule,
    BillingModule,
    ClinicalModule,
    NotificationsModule,
  ],
  controllers: [
    InsuranceProviderController,
    InsuranceEmpanelmentController,
    InsurancePolicyController,
    InsurancePreauthController,
    InsurancePreauthAttachmentController,
    InsuranceClaimController,
  ],
  providers: [
    InsurancePreauthAttachmentService,
    ManualInsurancePayerAdapter,
    {
      provide: INSURANCE_PAYER_ADAPTER,
      useExisting: ManualInsurancePayerAdapter,
    },
    InsuranceService,
    InsuranceRateResolverService,
    InsuranceClaimExternalService,
  ],
  exports: [InsuranceService, InsuranceClaimExternalService],
})
export class InsuranceModule {}
