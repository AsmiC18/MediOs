import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import { SubmitPatientNpsDto } from '../../engagement/dto/submit-patient-nps.dto';
import { PatientNpsService } from '../../engagement/patient-nps.service';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';

@Controller('portal')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_ENGAGEMENT)
export class PortalEngagementController {
  constructor(private readonly npsService: PatientNpsService) {}

  @Post('appointments/:appointmentId/nps')
  submitNps(
    @Request() req: { user: PatientPrincipal },
    @Param('appointmentId') appointmentId: string,
    @Body() dto: SubmitPatientNpsDto,
  ) {
    return this.npsService.submitForPortalPatient(
      req.user,
      appointmentId,
      dto,
    );
  }
}
