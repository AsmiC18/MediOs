import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateEmpanelmentDto, EmpanelmentQueryDto, UpdateEmpanelmentDto } from './dto/empanelment.dto';
import { InsuranceService } from './insurance.service';

@Controller('insurance/empanelments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsuranceEmpanelmentController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreateEmpanelmentDto) {
    return this.insuranceService.createEmpanelment(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any, @Query() query: EmpanelmentQueryDto) {
    return this.insuranceService.listEmpanelments(req.user, query);
  }

  @Patch(':id')
  @RequirePermissions('insurance:manage')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateEmpanelmentDto) {
    return this.insuranceService.updateEmpanelment(req.user, id, dto);
  }
}
