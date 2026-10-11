import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import { BillingCatalogueService } from './billing-catalogue.service';
import { CreateBillingCatalogueItemDto } from './dto/create-billing-catalogue-item.dto';
import { UpdateBillingCatalogueItemDto } from './dto/update-billing-catalogue-item.dto';

@Controller('billing/catalogue')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.BILLING)
export class BillingCatalogueController {
  constructor(private readonly billingCatalogueService: BillingCatalogueService) {}

  @Post()
  @RequirePermissions('billing:manage')
  create(@Request() req: any, @Body() dto: CreateBillingCatalogueItemDto) {
    return this.billingCatalogueService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('billing:read')
  list(
    @Request() req: any,
    @Query('activeOnly') activeOnly?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.billingCatalogueService.list(req.user, {
      activeOnly: activeOnly === 'true',
      branchId,
    });
  }

  @Patch(':id')
  @RequirePermissions('billing:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBillingCatalogueItemDto,
  ) {
    return this.billingCatalogueService.update(req.user, id, dto);
  }
}
