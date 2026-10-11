import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AssignHospitalPlanDto } from './dto/assign-hospital-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { ReplacePlanFeaturesDto } from './dto/replace-plan-features.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { HospitalDepartmentKey } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';
import { HospitalDepartmentToggleService } from './hospital-department-toggle.service';
import { PlanAdminUser, PlansService } from './plans.service';

class SetDepartmentToggleDto {
  @IsEnum(HospitalDepartmentKey)
  departmentKey!: HospitalDepartmentKey;

  @IsBoolean()
  enabled!: boolean;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly departmentToggleService: HospitalDepartmentToggleService,
  ) {}

  @Get('plans')
  @RequirePermissions('plans:read')
  listPlans() {
    return this.plansService.listPlans();
  }

  @Get('plans/:id')
  @RequirePermissions('plans:read')
  getPlan(@Param('id') id: string) {
    return this.plansService.getPlan(id);
  }

  @Post('plans')
  @RequirePermissions('plans:manage')
  createPlan(@Request() req: { user: PlanAdminUser }, @Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(req.user, dto);
  }

  @Patch('plans/:id')
  @RequirePermissions('plans:manage')
  updatePlan(
    @Request() req: { user: PlanAdminUser },
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plansService.updatePlan(req.user, id, dto);
  }

  @Get('plans/:id/features')
  @RequirePermissions('plans:read')
  async getPlanFeatures(@Param('id') id: string) {
    const plan = await this.plansService.getPlan(id);
    return { planId: plan.id, features: plan.features };
  }

  @Put('plans/:id/features')
  @RequirePermissions('plans:manage')
  replacePlanFeatures(
    @Request() req: { user: PlanAdminUser },
    @Param('id') id: string,
    @Body() dto: ReplacePlanFeaturesDto,
  ) {
    return this.plansService.replacePlanFeatures(req.user, id, dto);
  }

  @Get('hospitals/:hospitalId/plan')
  @RequirePermissions('plans:read')
  getHospitalPlan(
    @Request() req: { user: PlanAdminUser },
    @Param('hospitalId') hospitalId: string,
  ) {
    return this.plansService.getHospitalPlan(req.user, hospitalId);
  }

  @Put('hospitals/:hospitalId/plan')
  @RequirePermissions('plans:manage')
  assignHospitalPlan(
    @Request() req: { user: PlanAdminUser },
    @Param('hospitalId') hospitalId: string,
    @Body() dto: AssignHospitalPlanDto,
  ) {
    return this.plansService.assignHospitalPlan(req.user, hospitalId, dto);
  }

  @Get('hospitals/:hospitalId/department-toggles')
  @RequirePermissions('plans:read')
  async listDepartmentToggles(
    @Request() req: { user: PlanAdminUser },
    @Param('hospitalId') hospitalId: string,
  ) {
    await this.plansService.getHospitalPlan(req.user, hospitalId);
    return this.departmentToggleService.listForHospital(hospitalId);
  }

  @Put('hospitals/:hospitalId/department-toggles')
  @RequirePermissions('plans:manage')
  async setDepartmentToggle(
    @Request() req: { user: PlanAdminUser },
    @Param('hospitalId') hospitalId: string,
    @Body() dto: SetDepartmentToggleDto,
  ) {
    await this.plansService.getHospitalPlan(req.user, hospitalId);
    return this.departmentToggleService.setToggle(
      { sub: req.user.sub, hospitalId },
      dto.departmentKey,
      dto.enabled,
    );
  }
}
