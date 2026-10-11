import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalTimelineQueryDto } from './dto/portal-timeline-query.dto';
import { PortalPatientRecordsService } from './portal-patient-records.service';

@Controller('portal')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_PORTAL)
export class PortalPatientRecordsController {
  constructor(
    private readonly portalPatientRecordsService: PortalPatientRecordsService,
  ) {}

  @Get('timeline')
  getTimeline(
    @Request() req: { user: PatientPrincipal },
    @Query() query: PortalTimelineQueryDto,
  ) {
    return this.portalPatientRecordsService.getTimeline(req.user, query);
  }

  @Get('clinical-records')
  getClinicalRecords(@Request() req: { user: PatientPrincipal }) {
    return this.portalPatientRecordsService.getClinicalRecords(req.user);
  }

  @Get('prescriptions')
  getPrescriptions(@Request() req: { user: PatientPrincipal }) {
    return this.portalPatientRecordsService.getPrescriptions(req.user);
  }

  @Get('diagnostics')
  getDiagnostics(@Request() req: { user: PatientPrincipal }) {
    return this.portalPatientRecordsService.getDiagnostics(req.user);
  }
}
