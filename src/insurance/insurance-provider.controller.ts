import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import { InsuranceService } from './insurance.service';

@Controller('insurance/providers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsuranceProviderController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreateProviderDto) {
    return this.insuranceService.createProvider(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any) {
    return this.insuranceService.listProviders(req.user);
  }

  @Get(':id')
  @RequirePermissions('insurance:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.insuranceService.getProvider(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('insurance:manage')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateProviderDto) {
    return this.insuranceService.updateProvider(req.user, id, dto);
  }
}
