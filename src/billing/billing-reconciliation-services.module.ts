import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { InvoiceSplitPayerService } from './invoice-split-payer.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { RefundReconciliationService } from './refund-reconciliation.service';
import { RAZORPAY_RECONCILIATION_READER } from './razorpay-reconciliation.reader';
import { RazorpayService } from './razorpay.service';

/** Payment/refund reconciliation services for workers (no HTTP billing controllers). */
@Module({
  imports: [CommonModule, AuditModule],
  providers: [
    RazorpayService,
    InvoiceSplitPayerService,
    PaymentReconciliationService,
    RefundReconciliationService,
    {
      provide: RAZORPAY_RECONCILIATION_READER,
      useExisting: RazorpayService,
    },
  ],
  exports: [PaymentReconciliationService, RefundReconciliationService],
})
export class BillingReconciliationServicesModule {}
