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
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PaymentCheckoutService } from './payment-checkout.service';
import { CreateCheckoutIntentDto } from './dto/create-checkout-intent.dto';
import { PaymentsService } from './payments.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.BILLING)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentCheckoutService: PaymentCheckoutService,
  ) {}

  @Post()
  @RequirePermissions('billing:manage')
  create(@Request() req: any, @Body() dto: CreateInvoiceDto) {
    return this.billingService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('billing:read')
  findAll(@Request() req: any, @Query() query: InvoiceQueryDto) {
    return this.billingService.findAll(req.user, query);
  }

  @Post(':id/checkout')
  @RequirePermissions('payments:manage')
  createCheckout(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateCheckoutIntentDto,
  ) {
    return this.paymentCheckoutService.createCheckoutIntent(req.user, {
      invoiceId: id,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post(':id/payment')
  @RequirePermissions('payments:manage')
  initiatePayment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() _dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(req.user, id);
  }

  @Get(':id/payments')
  @RequirePermissions('payments:read')
  listPayments(@Request() req: any, @Param('id') id: string) {
    return this.paymentsService.listPaymentsForInvoice(req.user, id);
  }

  @Get(':id/reconciliation')
  @RequirePermissions('billing:read')
  getReconciliation(@Request() req: any, @Param('id') id: string) {
    return this.billingService.getReconciliation(req.user, id);
  }

  @Get(':id')
  @RequirePermissions('billing:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.billingService.findOne(req.user, id);
  }

  @Patch(':id/status')
  @RequirePermissions('billing:manage')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.billingService.updateStatus(req.user, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('billing:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.billingService.update(req.user, id, dto);
  }
}
