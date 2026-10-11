import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { CreateIpdDailyChartEntryDto } from './dto/ipd-daily-chart.dto';
import { IpdDailyChartService } from './ipd-daily-chart.service';

@Controller('ipd/admissions/:admissionId/daily-chart')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.IPD)
export class IpdDailyChartController {
  constructor(private readonly chartService: IpdDailyChartService) {}

  @Get()
  @RequirePermissions('ipd:read')
  list(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('admissionId') admissionId: string,
  ) {
    return this.chartService.listChart(req.user, admissionId);
  }

  @Post()
  @RequirePermissions('ipd:manage')
  add(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('admissionId') admissionId: string,
    @Body() dto: CreateIpdDailyChartEntryDto,
  ) {
    return this.chartService.addEntry(req.user, admissionId, dto);
  }
}
