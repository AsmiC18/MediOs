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
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  CreateSupplierDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { PharmacySupplierService } from './pharmacy-supplier.service';

@Controller('pharmacy/suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.PHARMACY)
export class PharmacySupplierController {
  constructor(private readonly supplierService: PharmacySupplierService) {}

  @Post()
  @RequirePermissions('pharmacy:manage')
  create(@Request() req: any, @Body() dto: CreateSupplierDto) {
    return this.supplierService.createSupplier(req.user, dto);
  }

  @Get()
  @RequirePermissions('pharmacy:read')
  list(@Request() req: any, @Query() query: SupplierQueryDto) {
    return this.supplierService.listSuppliers(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.supplierService.getSupplier(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('pharmacy:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.updateSupplier(req.user, id, dto);
  }
}
