import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkSchedulesService } from './work-schedules.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('work-schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class WorkSchedulesController {
  constructor(private readonly workSchedulesService: WorkSchedulesService) {}

  @Post()
  @RequirePermissions('work-schedules:manage')
  create(@Request() req: any, @Body() dto: CreateWorkScheduleDto) {
    return this.workSchedulesService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('work-schedules:read')
  findAll(@Request() req: any) {
    return this.workSchedulesService.findAll(req.user);
  }

  @Patch('branch/:branchId/remove')
  @RequirePermissions('work-schedules:manage')
  removeBranchOverride(
    @Request() req: any,
    @Param('branchId') branchId: string,
  ) {
    return this.workSchedulesService.removeBranchOverride(req.user, branchId);
  }

  @Get(':id')
  @RequirePermissions('work-schedules:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.findOne(req.user, id);
  }

  @Patch(':id/set-hospital-default')
  @RequirePermissions('work-schedules:manage')
  setHospitalDefault(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.setHospitalDefault(req.user, id);
  }

  @Patch(':id/assign-branch/:branchId')
  @RequirePermissions('work-schedules:manage')
  assignBranch(
    @Request() req: any,
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.workSchedulesService.assignBranch(req.user, id, branchId);
  }

  @Patch(':id')
  @RequirePermissions('work-schedules:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWorkScheduleDto,
  ) {
    return this.workSchedulesService.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('work-schedules:manage')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.remove(req.user, id);
  }
}
