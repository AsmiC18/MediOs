import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { AbdmConsentService } from './abdm-consent.service';
import { AbdmEnvironmentService } from './abdm-environment.service';

/** Consent services for background workers (no HTTP controllers). */
@Module({
  imports: [CommonModule, AuditModule],
  providers: [
    AbdmEnvironmentService,
    AbdmConsentManagerService,
    AbdmConsentAuditService,
    AbdmConsentService,
  ],
  exports: [AbdmConsentService],
})
export class AbdmConsentJobModule {}
