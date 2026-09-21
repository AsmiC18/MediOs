import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreatePolicyDto, PolicyQueryDto, UpdatePolicyDto } from './dto/policy.dto';
import { InsuranceService } from './insurance.service';

@Controller('insurance/policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsurancePolicyController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreatePolicyDto) {
    return this.insuranceService.createPolicy(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any, @Query() query: PolicyQueryDto) {
    return this.insuranceService.listPolicies(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('insurance:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.getPolicy(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('insurance:manage')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePolicyDto) {
    return this.insuranceService.updatePolicy(req.user, id, dto);
  }
}
