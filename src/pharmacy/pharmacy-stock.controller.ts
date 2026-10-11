import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { StockAdjustDto } from './dto/stock-adjust.dto';
import { PharmacyService } from './pharmacy.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('pharmacy/stock')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.PHARMACY)
export class PharmacyStockController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Post('adjust')
  @RequirePermissions('pharmacy:manage')
  adjustStock(@Request() req: any, @Body() dto: StockAdjustDto) {
    return this.pharmacyService.adjustStock(req.user, dto);
  }
}
