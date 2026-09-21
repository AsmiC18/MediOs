import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { InsuranceClaimController } from './insurance-claim.controller';
import { InsuranceEmpanelmentController } from './insurance-empanelment.controller';
import { InsurancePolicyController } from './insurance-policy.controller';
import { InsurancePreauthController } from './insurance-preauth.controller';
import { InsuranceProviderController } from './insurance-provider.controller';
import { InsuranceService } from './insurance.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [
    InsuranceProviderController,
    InsuranceEmpanelmentController,
    InsurancePolicyController,
    InsurancePreauthController,
    InsuranceClaimController,
  ],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
