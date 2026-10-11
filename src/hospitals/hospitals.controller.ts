import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { HospitalsService, TenantAdminUser } from './hospitals.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get('hospitals/me')
  @RequirePermissions('hospitals:read')
  getMyHospital(@Request() req: { user: TenantAdminUser }) {
    return this.hospitalsService.getMyHospital(req.user);
  }

  @Get('hospitals/:id')
  @RequirePermissions('hospitals:read')
  getHospital(@Request() req: { user: TenantAdminUser }, @Param('id') id: string) {
    return this.hospitalsService.getHospital(req.user, id);
  }

  @Patch('hospitals/me')
  @RequirePermissions('hospitals:manage')
  updateMyHospital(
    @Request() req: { user: TenantAdminUser },
    @Body() dto: UpdateHospitalDto,
  ) {
    return this.hospitalsService.updateMyHospital(req.user, dto);
  }

  @Patch('hospitals/:id')
  @RequirePermissions('hospitals:manage')
  updateHospital(
    @Request() req: { user: TenantAdminUser },
    @Param('id') id: string,
    @Body() dto: UpdateHospitalDto,
  ) {
    return this.hospitalsService.updateHospital(req.user, id, dto);
  }

  @Get('branches')
  @RequirePermissions('branches:read')
  listBranches(@Request() req: { user: TenantAdminUser }) {
    return this.hospitalsService.listBranches(req.user);
  }

  @Get('branches/:id')
  @RequirePermissions('branches:read')
  getBranch(@Request() req: { user: TenantAdminUser }, @Param('id') id: string) {
    return this.hospitalsService.getBranch(req.user, id);
  }

  @Post('branches')
  @RequirePermissions('branches:manage')
  createBranch(@Request() req: { user: TenantAdminUser }, @Body() dto: CreateBranchDto) {
    return this.hospitalsService.createBranch(req.user, dto);
  }

  @Patch('branches/:id')
  @RequirePermissions('branches:manage')
  updateBranch(
    @Request() req: { user: TenantAdminUser },
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.hospitalsService.updateBranch(req.user, id, dto);
  }
}
