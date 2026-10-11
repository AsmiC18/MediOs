import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FulfillPrescriptionWorkItemDto } from './dto/fulfill-prescription-work-item.dto';
import { PrescriptionWorkItemQueryDto } from './dto/prescription-work-item-query.dto';
import { PharmacyPrescriptionWorkItemService } from './pharmacy-prescription-work-item.service';

@Controller('pharmacy/prescription-work-items')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.PHARMACY)
export class PharmacyPrescriptionWorkItemController {
  constructor(
    private readonly workItemService: PharmacyPrescriptionWorkItemService,
  ) {}

  @Get()
  @RequirePermissions('pharmacy:read')
  list(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Query() query: PrescriptionWorkItemQueryDto,
  ) {
    return this.workItemService.listWorkItems(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  getOne(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('id') id: string,
  ) {
    return this.workItemService.getWorkItem(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('pharmacy:manage')
  cancel(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('id') id: string,
  ) {
    return this.workItemService.cancelWorkItem(req.user, id);
  }

  @Post(':id/fulfill')
  @RequirePermissions('pharmacy:manage')
  fulfill(
    @Request() req: { user: { sub: string; hospitalId: string; branchId?: string | null } },
    @Param('id') id: string,
    @Body() body: FulfillPrescriptionWorkItemDto,
  ) {
    return this.workItemService.fulfillWorkItem(req.user, id, body);
  }
}
