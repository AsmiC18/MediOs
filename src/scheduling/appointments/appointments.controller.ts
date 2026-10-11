import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { FeatureGuard } from '../../plans/feature.guard';
import { RequireFeature } from '../../plans/require-feature.decorator';
import { FeatureKey } from '../../plans/feature-keys';

@Controller('appointments')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @RequirePermissions('scheduling:manage')
  create(@Request() req: any, @Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('scheduling:read')
  findAll(
    @Request() req: any,
    @Query('patientId') patientId?: string,
    @Query('branchId') branchId?: string,
    @Query('status', new ParseEnumPipe(AppointmentStatus, { optional: true }))
    status?: AppointmentStatus,
    @Query('startAt') startAt?: string,
    @Query('endAt') endAt?: string,
  ) {
    return this.appointmentsService.findAll(req.user, {
      patientId,
      branchId,
      status,
      startAt,
      endAt,
    });
  }

  @Get(':id')
  @RequirePermissions('scheduling:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.appointmentsService.findOne(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('scheduling:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('scheduling:manage')
  cancel(@Request() req: any, @Param('id') id: string) {
    return this.appointmentsService.cancel(req.user, id);
  }
}
