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
import { ClinicalService } from './clinical.service';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpsertSoapDto } from './dto/upsert-soap.dto';

@Controller('clinical/encounters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalEncounterController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Post()
  @RequirePermissions('clinical:manage')
  createEncounter(@Request() req: any, @Body() dto: CreateEncounterDto) {
    return this.clinicalService.createEncounter(req.user, dto);
  }

  @Get()
  @RequirePermissions('clinical:read')
  listEncounters(@Request() req: any, @Query('patientId') patientId?: string) {
    return this.clinicalService.listEncounters(req.user, patientId);
  }

  @Get(':id')
  @RequirePermissions('clinical:read')
  getEncounter(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.getEncounter(req.user, id);
  }

  @Post(':id/complete')
  @RequirePermissions('clinical:manage')
  completeEncounter(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.completeEncounter(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('clinical:manage')
  cancelEncounter(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.cancelEncounter(req.user, id);
  }

  @Post(':id/soap')
  @RequirePermissions('clinical:manage')
  createOrUpdateSoap(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertSoapDto,
  ) {
    return this.clinicalService.createOrUpdateSoap(req.user, id, dto);
  }

  @Get(':id/soap')
  @RequirePermissions('clinical:read')
  getSoap(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.getSoap(req.user, id);
  }

  @Patch(':id/soap')
  @RequirePermissions('clinical:manage')
  updateSoap(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpsertSoapDto,
  ) {
    return this.clinicalService.createOrUpdateSoap(req.user, id, dto);
  }

  @Post(':id/diagnoses')
  @RequirePermissions('clinical:manage')
  createDiagnosis(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateDiagnosisDto,
  ) {
    return this.clinicalService.createDiagnosis(req.user, id, dto);
  }

  @Get(':id/diagnoses')
  @RequirePermissions('clinical:read')
  listDiagnoses(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.listDiagnoses(req.user, id);
  }

  @Post(':id/prescriptions')
  @RequirePermissions('clinical:manage')
  createPrescription(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.clinicalService.createPrescription(req.user, id, dto);
  }

  @Get(':id/prescriptions')
  @RequirePermissions('clinical:read')
  listPrescriptions(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.listPrescriptions(req.user, id);
  }
}
