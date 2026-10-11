import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePatientPrivacyConsentDto } from './dto/create-patient-privacy-consent.dto';
import { RejectPatientPrivacyErasureDto } from './dto/reject-patient-privacy-erasure.dto';
import { PatientPrivacyActor } from './patient-privacy-access.util';
import { PatientPrivacyConsentService } from './patient-privacy-consent.service';
import { PatientPrivacyExportService } from './patient-privacy-export.service';
import { PatientPrivacyErasureService } from './patient-privacy-erasure.service';

@Controller('patients/:patientId')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientPrivacyController {
  constructor(
    private readonly consentService: PatientPrivacyConsentService,
    private readonly exportService: PatientPrivacyExportService,
    private readonly erasureService: PatientPrivacyErasureService,
  ) {}

  @Get('privacy-consents')
  @RequirePermissions('patients:read')
  listConsents(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
  ) {
    return this.consentService.listConsents(req.user, patientId);
  }

  @Post('privacy-consents')
  @RequirePermissions('patients:update')
  grantConsent(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
    @Body() dto: CreatePatientPrivacyConsentDto,
  ) {
    return this.consentService.grantConsent(req.user, patientId, dto);
  }

  @Post('privacy-consents/:consentId/withdraw')
  @RequirePermissions('patients:update')
  withdrawConsent(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
    @Param('consentId') consentId: string,
  ) {
    return this.consentService.withdrawConsent(req.user, patientId, consentId);
  }

  @Post('privacy-export')
  @RequirePermissions('patients:read')
  exportPatient(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
  ) {
    return this.exportService.exportPatientData(req.user, patientId);
  }

  @Get('privacy-erasure')
  @RequirePermissions('patients:read')
  getErasure(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
  ) {
    return this.erasureService.getLatestErasureRequest(req.user, patientId);
  }

  @Post('privacy-erasure')
  @RequirePermissions('patients:update')
  requestErasure(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
  ) {
    return this.erasureService.requestErasure(req.user, patientId);
  }

  @Post('privacy-erasure/approve')
  @RequirePermissions('patients:privacy:manage')
  approveErasure(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
  ) {
    return this.erasureService.approveErasure(req.user, patientId);
  }

  @Post('privacy-erasure/reject')
  @RequirePermissions('patients:privacy:manage')
  rejectErasure(
    @Request() req: { user: PatientPrivacyActor },
    @Param('patientId') patientId: string,
    @Body() dto: RejectPatientPrivacyErasureDto,
  ) {
    return this.erasureService.rejectErasure(req.user, patientId, dto);
  }
}
