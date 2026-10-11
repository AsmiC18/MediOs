import { Body, Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { BillingService } from './billing.service';
import { UpdateConsultationFeeConfigDto } from './dto/update-consultation-fee-config.dto';

@Controller('billing/config')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.BILLING)
export class BillingConfigController {
  constructor(private readonly billingService: BillingService) {}

  @Get('consultation-fee')
  @RequirePermissions('billing:read')
  getConsultationFee(@Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } }) {
    return this.billingService.getConsultationFeeConfig(req.user);
  }

  @Patch('consultation-fee')
  @RequirePermissions('billing:manage')
  updateConsultationFee(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Body() dto: UpdateConsultationFeeConfigDto,
  ) {
    return this.billingService.updateConsultationFeeConfig(req.user, dto);
  }
}
