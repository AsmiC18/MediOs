import { Module } from '@nestjs/common';
import { BillingModule } from './billing.module';
import { PaymentReconciliationJobHandler } from './payment-reconciliation.job-handler';
import { RefundReconciliationJobHandler } from './refund-reconciliation.job-handler';

/** Billing reconciliation handlers for background workers (no HTTP controllers). */
@Module({
  imports: [BillingModule],
  providers: [PaymentReconciliationJobHandler, RefundReconciliationJobHandler],
  exports: [PaymentReconciliationJobHandler, RefundReconciliationJobHandler],
})
export class BillingReconciliationJobModule {}
