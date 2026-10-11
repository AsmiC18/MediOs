import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ClinicalService } from './clinical.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.CLINICAL)
export class PatientClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Get(':id/clinical-records')
  @RequirePermissions('clinical:read')
  getPatientClinicalRecords(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.getPatientClinicalRecords(req.user, id);
  }
}
