import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { EngagementActionQueryDto } from './dto/engagement-action-query.dto';
import { NpsQueryDto } from './dto/nps-query.dto';
import { RequestWinbackDto } from './dto/request-winback.dto';
import { PatientEngagementActionService } from './patient-engagement-action.service';
import { PatientNpsService } from './patient-nps.service';
import { PatientWinbackService } from './patient-winback.service';

@Controller('engagement')
@UseGuards(JwtAuthGuard, FeatureGuard, PermissionsGuard)
@RequireFeature(FeatureKey.PATIENT_ENGAGEMENT)
export class EngagementController {
  constructor(
    private readonly actionService: PatientEngagementActionService,
    private readonly npsService: PatientNpsService,
    private readonly winbackService: PatientWinbackService,
  ) {}

  @RequirePermissions('patients:engagement:read')
  @Get('nps/summary')
  npsSummary(@Request() req: any, @Query() query: NpsQueryDto) {
    return this.npsService.summaryForStaff(req.user, query);
  }

  @RequirePermissions('patients:engagement:read')
  @Get('nps')
  listNps(@Request() req: any, @Query() query: NpsQueryDto) {
    return this.npsService.listForStaff(req.user, query);
  }

  @RequirePermissions('patients:engagement:read')
  @Get('nps/:id')
  getNps(@Request() req: any, @Param('id') id: string) {
    return this.npsService.getByIdForStaff(req.user, id);
  }

  @RequirePermissions('patients:engagement:read')
  @Get('winback/segment-preview')
  previewWinbackSegment(
    @Request() req: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.winbackService.previewEligibleSegment(
      req.user,
      branchId ?? undefined,
    );
  }

  @RequirePermissions('patients:engagement:manage')
  @Post('winback')
  requestWinback(@Request() req: any, @Body() dto: RequestWinbackDto) {
    return this.winbackService.requestWinback(req.user, dto);
  }
}

@Controller('patients')
@UseGuards(JwtAuthGuard, FeatureGuard, PermissionsGuard)
@RequireFeature(FeatureKey.PATIENT_ENGAGEMENT)
export class PatientsEngagementController {
  constructor(private readonly actionService: PatientEngagementActionService) {}

  @RequirePermissions('patients:engagement:read')
  @Get('engagement/actions')
  listActions(@Request() req: any, @Query() query: EngagementActionQueryDto) {
    return this.actionService.listActions(req.user, query);
  }

  @RequirePermissions('patients:engagement:read')
  @Get(':patientId/engagement/actions')
  listPatientActions(
    @Request() req: any,
    @Param('patientId') patientId: string,
  ) {
    return this.actionService.listActionsForPatient(req.user, patientId);
  }

  @RequirePermissions('patients:engagement:manage')
  @Post(':patientId/engagement/actions/:actionId/act')
  act(
    @Request() req: any,
    @Param('patientId') patientId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionService.actOnAction(req.user, patientId, actionId);
  }

  @RequirePermissions('patients:engagement:manage')
  @Post(':patientId/engagement/actions/:actionId/dismiss')
  dismiss(
    @Request() req: any,
    @Param('patientId') patientId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.actionService.dismissAction(req.user, patientId, actionId);
  }
}
