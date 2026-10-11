import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CreateInsurancePackageDto,
  CreateInsurancePackageRateDto,
  PackageQueryDto,
  UpdateInsurancePackageDto,
  UpdateInsurancePackageRateDto,
} from './dto/package.dto';
import { InsurancePackageService } from './insurance-package.service';

@Controller('insurance/packages')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.INSURANCE)
export class InsurancePackageController {
  constructor(private readonly packageService: InsurancePackageService) {}

  @Post()
  @RequirePermissions('insurance:manage')
  create(@Request() req: any, @Body() dto: CreateInsurancePackageDto) {
    return this.packageService.createPackage(req.user, dto);
  }

  @Get()
  @RequirePermissions('insurance:read')
  list(@Request() req: any, @Query() query: PackageQueryDto) {
    return this.packageService.listPackages(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('insurance:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.packageService.getPackage(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('insurance:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInsurancePackageDto,
  ) {
    return this.packageService.updatePackage(req.user, id, dto);
  }

  @Post(':id/rates')
  @RequirePermissions('insurance:manage')
  createRate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateInsurancePackageRateDto,
  ) {
    return this.packageService.createRate(req.user, id, dto);
  }

  @Patch(':packageId/rates/:rateId')
  @RequirePermissions('insurance:manage')
  updateRate(
    @Request() req: any,
    @Param('packageId') packageId: string,
    @Param('rateId') rateId: string,
    @Body() dto: UpdateInsurancePackageRateDto,
  ) {
    return this.packageService.updateRate(req.user, packageId, rateId, dto);
  }
}
