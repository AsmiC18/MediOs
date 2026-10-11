import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalPatientsService } from './portal-patients.service';

@Controller('portal')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_PORTAL)
export class PortalPatientsController {
  constructor(private readonly portalPatientsService: PortalPatientsService) {}

  @Get('me')
  getMe(@Request() req: { user: PatientPrincipal }) {
    return this.portalPatientsService.getMe(req.user);
  }
}
