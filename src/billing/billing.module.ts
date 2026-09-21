import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayService } from './razorpay.service';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [CommonModule, AuditModule],
  controllers: [
    BillingController,
    PaymentsController,
    RefundsController,
    RazorpayWebhookController,
  ],
  providers: [
    BillingService,
    PaymentsService,
    RefundsService,
    RazorpayService,
  ],
  exports: [BillingService, PaymentsService, RefundsService],
})
export class BillingModule {}
