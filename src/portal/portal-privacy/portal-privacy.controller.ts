import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalGrantConsentDto } from './dto/portal-grant-consent.dto';
import { PortalPrivacyService } from './portal-privacy.service';

@Controller('portal/privacy')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_PORTAL)
export class PortalPrivacyController {
  constructor(private readonly portalPrivacyService: PortalPrivacyService) {}

  @Get('consents')
  listConsents(@Request() req: { user: PatientPrincipal }) {
    return this.portalPrivacyService.listConsents(req.user);
  }

  @Post('consents')
  grantConsent(
    @Request() req: { user: PatientPrincipal },
    @Body() dto: PortalGrantConsentDto,
  ) {
    return this.portalPrivacyService.grantConsent(req.user, dto);
  }

  @Post('consents/:consentId/withdraw')
  withdrawConsent(
    @Request() req: { user: PatientPrincipal },
    @Param('consentId') consentId: string,
  ) {
    return this.portalPrivacyService.withdrawConsent(req.user, consentId);
  }

  @Post('export')
  requestExport(@Request() req: { user: PatientPrincipal }) {
    return this.portalPrivacyService.requestExport(req.user);
  }

  @Get('export')
  getExport(@Request() req: { user: PatientPrincipal }) {
    return this.portalPrivacyService.getExport(req.user);
  }

  @Get('erasure')
  getErasure(@Request() req: { user: PatientPrincipal }) {
    return this.portalPrivacyService.getErasureStatus(req.user);
  }

  @Post('erasure')
  requestErasure(@Request() req: { user: PatientPrincipal }) {
    return this.portalPrivacyService.requestErasure(req.user);
  }
}
