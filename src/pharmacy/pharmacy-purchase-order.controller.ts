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
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  ReceiveStockDto,
  UpdateDraftPurchaseOrderDto,
} from './dto/purchase-order.dto';
import { PharmacyPurchaseOrderService } from './pharmacy-purchase-order.service';

@Controller('pharmacy/purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.PHARMACY)
export class PharmacyPurchaseOrderController {
  constructor(
    private readonly purchaseOrderService: PharmacyPurchaseOrderService,
  ) {}

  @Post()
  @RequirePermissions('pharmacy:manage')
  create(@Request() req: any, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrderService.createPurchaseOrder(req.user, dto);
  }

  @Get()
  @RequirePermissions('pharmacy:read')
  list(@Request() req: any, @Query() query: PurchaseOrderQueryDto) {
    return this.purchaseOrderService.listPurchaseOrders(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrderService.getPurchaseOrder(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('pharmacy:manage')
  updateDraft(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDraftPurchaseOrderDto,
  ) {
    return this.purchaseOrderService.updateDraftPurchaseOrder(req.user, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('pharmacy:manage')
  submit(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrderService.submitPurchaseOrder(req.user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('pharmacy:manage')
  approve(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrderService.approvePurchaseOrder(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('pharmacy:manage')
  cancel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
  ) {
    return this.purchaseOrderService.cancelPurchaseOrder(req.user, id, dto);
  }

  @Post(':id/receive')
  @RequirePermissions('pharmacy:manage')
  receive(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.purchaseOrderService.receiveStock(req.user, id, dto);
  }
}
