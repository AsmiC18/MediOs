import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { RefundsService } from './refunds.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('refunds')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.BILLING)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get(':id')
  @RequirePermissions('refunds:read')
  getRefund(@Request() req: any, @Param('id') id: string) {
    return this.refundsService.getRefund(req.user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('refunds:approve')
  approveRefund(@Request() req: any, @Param('id') id: string) {
    return this.refundsService.approveRefund(req.user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('refunds:approve')
  rejectRefund(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RejectRefundDto,
  ) {
    return this.refundsService.rejectRefund(req.user, id, dto);
  }

  @Post(':id/execute')
  @RequirePermissions('refunds:approve')
  executeRefund(@Request() req: any, @Param('id') id: string) {
    return this.refundsService.executeApprovedRefund(req.user, id);
  }
}
