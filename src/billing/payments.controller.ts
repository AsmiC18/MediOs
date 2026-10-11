import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.BILLING)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
  ) {}

  @Post(':id/refund')
  @RequirePermissions('refunds:manage')
  createRefund(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    return this.refundsService.createRefund(req.user, id, dto, idempotencyKey);
  }

  @Get(':id/refunds')
  @RequirePermissions('refunds:read')
  listRefunds(@Request() req: any, @Param('id') id: string) {
    return this.refundsService.listRefundsForPayment(req.user, id);
  }

  @Get(':id')
  @RequirePermissions('payments:read')
  getPayment(@Request() req: any, @Param('id') id: string) {
    return this.paymentsService.getPayment(req.user, id);
  }
}
