import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';
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
import { AppointmentsService } from '../../scheduling/appointments/appointments.service';
import { PortalJwtAuthGuard } from '../portal-auth/guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from '../portal-auth/guards/portal-principal.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalAppointmentQueryDto } from './dto/portal-appointment-query.dto';
import { PortalCreateAppointmentDto } from './dto/portal-create-appointment.dto';
import { PortalSlotsQueryDto } from './dto/portal-slots-query.dto';
import { PortalUpdateAppointmentDto } from './dto/portal-update-appointment.dto';

@Controller('portal')
@UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard, FeatureGuard)
@RequireFeature(FeatureKey.PATIENT_PORTAL)
export class PortalAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('appointments')
  list(
    @Request() req: { user: PatientPrincipal },
    @Query() query: PortalAppointmentQueryDto,
  ) {
    return this.appointmentsService.findAllForPortalPatient(req.user, query);
  }

  @Get('appointments/:id')
  getOne(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
  ) {
    return this.appointmentsService.findOneForPortalPatient(req.user, id);
  }

  @Post('appointments')
  create(
    @Request() req: { user: PatientPrincipal },
    @Body() dto: PortalCreateAppointmentDto,
  ) {
    return this.appointmentsService.createForPortalPatient(req.user, dto);
  }

  @Patch('appointments/:id')
  update(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
    @Body() dto: PortalUpdateAppointmentDto,
  ) {
    return this.appointmentsService.updateForPortalPatient(req.user, id, dto);
  }

  @Post('appointments/:id/cancel')
  cancel(
    @Request() req: { user: PatientPrincipal },
    @Param('id') id: string,
  ) {
    return this.appointmentsService.cancelForPortalPatient(req.user, id);
  }

  @Get('scheduling/slots')
  slots(
    @Request() req: { user: PatientPrincipal },
    @Query() query: PortalSlotsQueryDto,
  ) {
    return this.appointmentsService.findAvailableSlotsForPortal({
      hospitalId: req.user.hospitalId,
      branchId: query.branchId,
      resourceIds: query.resourceIds,
      date: query.date,
      durationMinutes: query.durationMinutes,
    });
  }
}
