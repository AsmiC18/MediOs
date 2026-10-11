import {

  Body,

  Controller,

  Get,

  Param,

  Patch,

  Post,

  Query,

  Request,

  UseGuards,

} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { PermissionsGuard } from '../auth/guards/permissions.guard';

import { RequirePermissions } from '../auth/decorators/permissions.decorator';

import { CreatePatientDto } from './dto/create-patient.dto';

import { EvaluateAtRiskDto } from './dto/evaluate-at-risk.dto';

import { PatientQueryDto } from './dto/patient-query.dto';

import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdatePatientNotificationPreferenceDto } from './dto/update-patient-notification-preference.dto';

import { PatientDuplicateQueryDto } from './dto/patient-duplicate-query.dto';
import { PatientTimelineQueryDto } from './dto/patient-timeline-query.dto';
import { PatientTimelineService } from './patient-timeline.service';
import { PatientsService } from './patients.service';



@Controller('patients')

export class PatientsController {

  constructor(
    private readonly patientsService: PatientsService,
    private readonly patientTimelineService: PatientTimelineService,
  ) {}



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Get()

  findAll(@Request() req: any, @Query() query: PatientQueryDto) {

    return this.patientsService.findAll(req.user, query);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:create')

  @Post()

  create(@Request() req: any, @Body() dto: CreatePatientDto) {

    return this.patientsService.create(req.user, dto);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:update')

  @Post(':sourceId/merge/:targetId')

  merge(

    @Request() req: any,

    @Param('sourceId') sourceId: string,

    @Param('targetId') targetId: string,

  ) {

    return this.patientsService.mergePatients(req.user, sourceId, targetId);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('patients:read')
  @Get('duplicates/search')
  findDuplicateCandidates(
    @Request() req: any,
    @Query() query: PatientDuplicateQueryDto,
  ) {
    return this.patientsService.findDuplicateCandidates(req.user, query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Get(':id/field-history')

  findFieldHistory(@Request() req: any, @Param('id') id: string) {

    return this.patientsService.findFieldHistory(req.user, id);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:update')

  @Post(':id/evaluate-at-risk')

  evaluateAtRisk(

    @Request() req: any,

    @Param('id') id: string,

    @Body() dto: EvaluateAtRiskDto,

  ) {

    return this.patientsService.evaluateAtRisk(req.user, id, dto);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Get(':id/notification-preferences')

  getNotificationPreferences(@Request() req: any, @Param('id') id: string) {

    return this.patientsService.getNotificationPreferences(req.user, id);

  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:update')

  @Patch(':id/notification-preferences')

  updateNotificationPreferences(

    @Request() req: any,

    @Param('id') id: string,

    @Body() dto: UpdatePatientNotificationPreferenceDto,

  ) {

    return this.patientsService.updateNotificationPreferences(req.user, id, dto);

  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Get(':id/timeline')

  getTimeline(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: PatientTimelineQueryDto,
  ) {
    return this.patientTimelineService.getTimeline(req.user, id, query);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Get(':id')

  findOne(@Request() req: any, @Param('id') id: string) {

    return this.patientsService.findOne(req.user, id);

  }



  @UseGuards(JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:update')

  @Patch(':id')

  update(

    @Request() req: any,

    @Param('id') id: string,

    @Body() dto: UpdatePatientDto,

  ) {

    return this.patientsService.update(req.user, id, dto);

  }

}


