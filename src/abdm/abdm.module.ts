import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { AbdmBridgeService } from './abdm-bridge.service';
import { AbdmCallbackAuthenticationService } from './abdm-callback-authentication.service';
import { AbdmCallbackController } from './abdm-callback.controller';
import { AbdmCallbackValidationService } from './abdm-callback-validation.service';
import { AbdmCallbackService } from './abdm-callback.service';
import { AbdmCertificateService } from './abdm-certificate.service';
import { AbdmConfigService } from './abdm-config.service';
import { AbdmConsentAuditService } from './abdm-consent-audit.service';
import { AbdmConsentController } from './abdm-consent.controller';
import { AbdmConsentManagerService } from './abdm-consent-manager.service';
import { AbdmConsentService } from './abdm-consent.service';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmGatewayService } from './abdm-gateway.service';
import { AbdmHfrSearchService } from './abdm-hfr-search.service';
import { AbdmHfrService } from './abdm-hfr.service';
import { AbdmHprService } from './abdm-hpr.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmLinkTokenService } from './abdm-link-token.service';
import { AbdmProfessionalService } from './abdm-professional.service';
import { AbdmSessionService } from './abdm-session.service';
import { AbdmController, AbdmUserController } from './abdm.controller';
import { PatientAbhaController } from './patient-abha.controller';
import { PatientAbhaService } from './patient-abha.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [
    AbdmController,
    AbdmUserController,
    PatientAbhaController,
    AbdmConsentController,
    AbdmCallbackController,
  ],
  providers: [
    AbdmConfigService,
    AbdmProfessionalService,
    PatientAbhaService,
    AbdmConsentService,
    AbdmConsentManagerService,
    AbdmConsentAuditService,
    AbdmEnvironmentService,
    AbdmGatewayService,
    AbdmSessionService,
    AbdmHeadersService,
    AbdmCertificateService,
    AbdmBridgeService,
    AbdmLinkTokenService,
    AbdmCallbackAuthenticationService,
    AbdmCallbackValidationService,
    AbdmCallbackService,
    AbdmHfrSearchService,
    AbdmHfrService,
    AbdmHprService,
  ],
  exports: [
    AbdmEnvironmentService,
    AbdmGatewayService,
    AbdmSessionService,
    AbdmHeadersService,
    AbdmCertificateService,
    AbdmBridgeService,
    AbdmLinkTokenService,
  ],
})
export class AbdmModule {}
