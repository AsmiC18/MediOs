import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { ReportsBillingHookModule } from '../reports/reports-billing-hook.module';
import { BillingConfigController } from './billing-config.controller';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayService } from './razorpay.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { BillingCatalogueController } from './billing-catalogue.controller';
import { BillingCatalogueService } from './billing-catalogue.service';
import { PaymentCheckoutService } from './payment-checkout.service';
import {
  RAZORPAY_CHECKOUT_ADAPTER,
  UnconfiguredRazorpayCheckoutAdapter,
} from './razorpay-checkout.adapter';
import { BillingReconciliationServicesModule } from './billing-reconciliation-services.module';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    ReportsBillingHookModule,
    BillingReconciliationServicesModule,
  ],
  controllers: [
    BillingController,
    BillingConfigController,
    BillingCatalogueController,
    PaymentsController,
    RefundsController,
    RazorpayWebhookController,
  ],
  providers: [
    BillingService,
    BillingCatalogueService,
    PaymentCheckoutService,
    PaymentsService,
    RefundsService,
    RazorpayService,
    InvoiceSplitPayerService,
    UnconfiguredRazorpayCheckoutAdapter,
    {
      provide: RAZORPAY_CHECKOUT_ADAPTER,
      useExisting: UnconfiguredRazorpayCheckoutAdapter,
    },
  ],
  exports: [
    BillingService,
    BillingCatalogueService,
    PaymentCheckoutService,
    PaymentsService,
    RefundsService,
    InvoiceSplitPayerService,
    BillingReconciliationServicesModule,
  ],
})
export class BillingModule {}
