import { Module } from '@nestjs/common';
import { BillingReconciliationServicesModule } from './billing-reconciliation-services.module';
import { PaymentReconciliationJobHandler } from './payment-reconciliation.job-handler';
import { RefundReconciliationJobHandler } from './refund-reconciliation.job-handler';

/** Billing reconciliation handlers for background workers (no HTTP controllers). */
@Module({
  imports: [BillingReconciliationServicesModule],
  providers: [PaymentReconciliationJobHandler, RefundReconciliationJobHandler],
  exports: [PaymentReconciliationJobHandler, RefundReconciliationJobHandler],
})
export class BillingReconciliationJobModule {}
