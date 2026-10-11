import {
  Body,
  Controller,
  Delete,
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
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/create-product.dto';
import { PharmacyService } from './pharmacy.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('pharmacy/products')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.PHARMACY)
export class PharmacyProductController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Post()
  @RequirePermissions('pharmacy:manage')
  createProduct(@Request() req: any, @Body() dto: CreateProductDto) {
    return this.pharmacyService.createProduct(req.user, dto);
  }

  @Get()
  @RequirePermissions('pharmacy:read')
  listProducts(@Request() req: any, @Query() query: ProductQueryDto) {
    return this.pharmacyService.listProducts(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  getProduct(@Request() req: any, @Param('id') id: string) {
    return this.pharmacyService.getProduct(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('pharmacy:manage')
  updateProduct(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.pharmacyService.updateProduct(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('pharmacy:manage')
  deleteProduct(@Request() req: any, @Param('id') id: string) {
    return this.pharmacyService.deleteProduct(req.user, id);
  }
}
