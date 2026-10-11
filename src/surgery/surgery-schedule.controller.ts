import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { PermissionsGuard } from '../auth/guards/permissions.guard';

import { RequirePermissions } from '../auth/decorators/permissions.decorator';

import { SurgeryScheduleQueryDto } from './dto/schedule.dto';

import { SurgeryService } from './surgery.service';

import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('surgery/schedules')

@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SURGERY)

export class SurgeryScheduleController {

  constructor(private readonly surgeryService: SurgeryService) {}



  @Get()

  @RequirePermissions('surgery:read')

  list(@Request() req: any, @Query() query: SurgeryScheduleQueryDto) {

    return this.surgeryService.listSchedules(req.user, query);

  }



  @Get(':id')

  @RequirePermissions('surgery:read')

  get(@Request() req: any, @Param('id') id: string) {

    return this.surgeryService.getSchedule(req.user, id);

  }

}


